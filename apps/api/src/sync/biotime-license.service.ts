import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import axios, { AxiosInstance } from "axios";
import FormData = require("form-data");
import { createReadStream, existsSync } from "node:fs";
import { basename } from "node:path";
import { CookieJar } from "tough-cookie";
import { AuditService } from "../audit/audit.service";

export type BioTimeLicenseResult = {
  success: boolean;
  message: string;
  activatedAt: Date;
};

type LicenseHttpClientFactory = (jar: CookieJar) => AxiosInstance;

@Injectable()
export class BioTimeLicenseService {
  private readonly logger = new Logger(BioTimeLicenseService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Optional()
    @Inject("BIOTIME_LICENSE_HTTP_CLIENT_FACTORY")
    private readonly clientFactory?: LicenseHttpClientFactory
  ) {}

  @Cron(process.env.BIOTIME_LICENSE_CRON || "30 8 * * *", {
    name: "biotime-license-daily-reactivation",
    timeZone: process.env.BIOTIME_LICENSE_TIMEZONE || "Europe/Paris"
  })
  async scheduledReactivation() {
    this.logger.log("Début tentative réactivation licence BioTime automatique (08:30 Europe/Paris).");
    try {
      const result = await this.reactivate();
      this.logger.log(`Réactivation licence BioTime automatique réussie à ${result.activatedAt.toISOString()}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Réactivation licence BioTime automatique échouée sans interrompre le serveur: ${message}`);
    }
  }

  async reactivate(): Promise<BioTimeLicenseResult> {
    const activatedAt = new Date();

    try {
      const jar = new CookieJar();
      const client = this.createClient(jar);
      const licenseFilePath = this.required("BIOTIME_LICENSE_FILE_PATH");
      this.logger.log(`Chemin fichier licence BioTime utilisé: ${licenseFilePath}`);

      if (!existsSync(licenseFilePath)) {
        throw new Error(`Fichier licence BioTime introuvable: ${licenseFilePath}`);
      }

      // BioTime laisse cette page accessible lorsque la licence inactive bloque précisément le login.
      // L'activation hors ligne doit donc être tentée avant toute authentification web.
      const activationPage = await client.get<string>(this.activationPath());
      const activationCsrf = this.extractCsrf(activationPage.data, jar);
      const form = new FormData();
      form.append("csrfmiddlewaretoken", activationCsrf);
      form.append("license_file", createReadStream(licenseFilePath), basename(licenseFilePath));

      const activationResponse = await client.post<unknown>(this.activationPath(), form, {
        headers: {
          ...form.getHeaders(),
          "X-CSRFToken": activationCsrf,
          Referer: this.absoluteUrl(this.activationPath())
        },
        maxBodyLength: Infinity
      });

      const activationData = activationResponse.data;
      if (!this.isSuccessResponse(activationData)) {
        throw new Error(`Réactivation BioTime refusée: ${this.extractResponseMessage(activationData)}`);
      }

      const result = {
        success: true,
        message: "Licence BioTime réactivée avec succès.",
        activatedAt
      };
      this.logger.log(result.message);
      await this.recordAudit(result);
      return result;
    } catch (error) {
      const result = {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        activatedAt
      };
      this.logger.error(`Réactivation licence BioTime échouée: ${result.message}`);
      await this.recordAudit(result);
      throw error;
    }
  }

  private createClient(jar: CookieJar) {
    if (this.clientFactory) {
      return this.clientFactory(jar);
    }

    const baseURL = this.required("BIOTIME_BASE_URL");
    const client = axios.create({
      baseURL,
      timeout: Number(this.config.get("BIOTIME_LICENSE_TIMEOUT_MS") || this.config.get("BIOTIME_TIMEOUT_MS") || 30_000),
      withCredentials: true
    });

    client.interceptors.request.use(config => {
      const url = new URL(String(config.url || ""), baseURL).toString();
      const cookie = jar.getCookieStringSync(url);
      if (cookie) {
        config.headers.set("Cookie", cookie);
      }
      return config;
    });

    client.interceptors.response.use(response => {
      const url = new URL(String(response.config.url || ""), baseURL).toString();
      const setCookie = response.headers["set-cookie"];
      const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
      for (const cookie of cookies) {
        jar.setCookieSync(cookie, url);
      }
      return response;
    });

    return client;
  }

  private extractCsrf(html: string, jar: CookieJar) {
    const hidden = /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/i.exec(html)
      || /value=["']([^"']+)["']\s+name=["']csrfmiddlewaretoken["']/i.exec(html);
    if (hidden?.[1]) return hidden[1];

    const cookies = jar.getCookiesSync(this.required("BIOTIME_BASE_URL"));
    const cookie = cookies.find(item => item.key === "csrftoken");
    if (cookie?.value) return cookie.value;

    throw new Error("Token CSRF BioTime introuvable.");
  }

  private isSuccessResponse(payload: unknown) {
    if (payload && typeof payload === "object") {
      const data = payload as Record<string, unknown>;
      if (data.success === true || data.status === true) return true;
      if ("ret" in data && Number(data.ret) === 0) return true;
      const message = String(data.message ?? data.msg ?? data.detail ?? "").toLowerCase();
      if (message.includes("successfully activated") || message.includes("activation successful") || message.includes("activation réussie") || message.includes("activation reussie")) return true;
    }
    const normalized = String(payload || "").toLowerCase();
    return normalized.includes("activation réussie")
      || normalized.includes("activation reussie")
      || normalized.includes("activation successful")
      || normalized.includes("success");
  }

  private extractResponseMessage(payload: unknown) {
    if (payload && typeof payload === "object") {
      const data = payload as Record<string, unknown>;
      const message = data.message ?? data.msg ?? data.detail ?? data.error;
      if (message) return String(message).slice(0, 500);
      return JSON.stringify(data).slice(0, 500);
    }
    const text = String(payload || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.slice(0, 500) || "réponse BioTime sans confirmation de succès";
  }

  private async recordAudit(result: BioTimeLicenseResult) {
    await this.audit.record({
      userId: null,
      action: "biotime.license_reactivation",
      entityType: "biotime_license",
      metadata: {
        success: result.success,
        message: result.message,
        activatedAt: result.activatedAt.toISOString()
      }
    });
  }

  private loginPath() {
    return this.config.get<string>("BIOTIME_WEB_LOGIN_PATH") || "/login/";
  }

  private activationPath() {
    return this.config.get<string>("BIOTIME_LICENSE_ACTIVATION_PATH") || "/offlineActivation/";
  }

  private absoluteUrl(path: string) {
    return new URL(path, this.required("BIOTIME_BASE_URL")).toString();
  }

  private required(key: string) {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`${key} est obligatoire pour la réactivation de licence BioTime.`);
    }
    return value;
  }
}
