import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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

  async reactivate(): Promise<BioTimeLicenseResult> {
    const activatedAt = new Date();

    try {
      const jar = new CookieJar();
      const client = this.createClient(jar);
      const licenseFilePath = this.required("BIOTIME_LICENSE_FILE_PATH");

      if (!existsSync(licenseFilePath)) {
        throw new Error(`Fichier licence BioTime introuvable: ${licenseFilePath}`);
      }

      const loginPage = await client.get<string>(this.loginPath());
      const loginCsrf = this.extractCsrf(loginPage.data, jar);
      const loginPayload = new URLSearchParams({
        username: this.required("BIOTIME_USERNAME"),
        password: this.required("BIOTIME_PASSWORD"),
        login_type: "pwd"
      });

      const loginResponse = await client.post(this.loginPath(), loginPayload.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRFToken": loginCsrf,
          Referer: this.absoluteUrl(this.loginPath())
        }
      });
      const loginData = loginResponse.data;
      if (loginData && typeof loginData === "object" && "ret" in loginData && Number(loginData.ret) !== 0) {
        throw new Error(`Login web BioTime refusé: ${String(loginData.message || "ret != 0")}`);
      }

      const activationPage = await client.get<string>(this.activationPath());
      const activationCsrf = this.extractCsrf(activationPage.data, jar);
      const form = new FormData();
      form.append("csrfmiddlewaretoken", activationCsrf);
      form.append("license_file", createReadStream(licenseFilePath), basename(licenseFilePath));

      const activationResponse = await client.post<string>(this.activationPath(), form, {
        headers: {
          ...form.getHeaders(),
          "X-CSRFToken": activationCsrf,
          Referer: this.absoluteUrl(this.activationPath())
        },
        maxBodyLength: Infinity
      });

      const html = String(activationResponse.data || "");
      if (!this.isSuccessResponse(html)) {
        throw new Error("Réactivation BioTime non confirmée par la réponse HTML.");
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

  private isSuccessResponse(html: string) {
    const normalized = html.toLowerCase();
    return normalized.includes("activation réussie")
      || normalized.includes("activation reussie")
      || normalized.includes("activation successful")
      || normalized.includes("success");
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
