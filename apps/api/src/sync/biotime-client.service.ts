import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import { BioTimeLicenseService } from "./biotime-license.service";
import { BioTimeListResponse, BioTimeRecord, ProgressCallback } from "./biotime.types";

@Injectable()
export class BioTimeClientService {
  private readonly client: AxiosInstance;
  private token: string | null = null;
  private authScheme: string = "Token";

  constructor(
    private readonly config: ConfigService,
    private readonly license: BioTimeLicenseService
  ) {
    const baseURL = this.required("BIOTIME_BASE_URL");
    this.client = axios.create({
      baseURL,
      timeout: Number(this.config.get("BIOTIME_TIMEOUT_MS") || 30_000)
    });
  }

  async listEmployees(updatedAfter?: string) {
    return this.paginatedGet("/personnel/api/employees/", this.buildSinceParams(updatedAfter, ["update_time", "updated_time", "last_update"]));
  }

  async listResigns(updatedAfter?: string) {
    return this.paginatedGet("/personnel/api/resigns/", this.buildSinceParams(updatedAfter, ["update_time", "updated_time", "resign_date"]));
  }

  async listDevices(updatedAfter?: string) {
    return this.paginatedGet("/iclock/api/terminals/", this.buildSinceParams(updatedAfter, ["update_time", "updated_time", "last_activity"]));
  }

  async listTransactions(punchedAfter?: string, onProgress?: ProgressCallback, punchedBefore?: string) {
    const params: Record<string, string> = {};
    if (punchedAfter) params.start_time = formatBioTimeDateTime(punchedAfter);
    if (punchedBefore) params.end_time = formatBioTimeDateTime(punchedBefore);
    return this.paginatedGet("/iclock/api/transactions/", params, onProgress);
  }

  async listTransactionsForEmployee(empCode: string, punchedAfter?: string, onProgress?: ProgressCallback, punchedBefore?: string) {
    const params: Record<string, string> = { emp_code: empCode };
    if (punchedAfter) params.start_time = formatBioTimeDateTime(punchedAfter);
    if (punchedBefore) params.end_time = formatBioTimeDateTime(punchedBefore);
    return this.paginatedGet("/iclock/api/transactions/", params, onProgress);
  }

  async listTransactionsUploadedAfter(uploadedAfter?: string, onProgress?: ProgressCallback, uploadedBefore?: string) {
    const params: Record<string, string> = {};
    if (uploadedAfter) params.upload_time__gte = formatBioTimeDateTime(uploadedAfter);
    if (uploadedBefore) params.upload_time__lte = formatBioTimeDateTime(uploadedBefore);
    return this.paginatedGet(
      "/iclock/api/transactions/",
      params,
      onProgress,
      Number(this.config.get("BIOTIME_UPLOAD_SYNC_MAX_PAGES") || 10)
    );
  }

  async downloadAsset(pathOrUrl: string) {
    await this.authenticate();

    try {
      const response = await this.client.get<ArrayBuffer>(pathOrUrl, {
        responseType: "arraybuffer",
        headers: this.authHeaders()
      });

      return {
        buffer: Buffer.from(response.data),
        contentType: String(response.headers["content-type"] || "application/octet-stream")
      };
    } catch (error) {
      if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status || 0)) {
        const response = await this.client.get<ArrayBuffer>(pathOrUrl, {
          responseType: "arraybuffer"
        });

        return {
          buffer: Buffer.from(response.data),
          contentType: String(response.headers["content-type"] || "application/octet-stream")
        };
      }

      throw error;
    }
  }

  private async paginatedGet(path: string, params: Record<string, string>, onProgress?: ProgressCallback, maxPagesOverride?: number) {
    await this.authenticate();
    const pageSize = Number(this.config.get("BIOTIME_PAGE_SIZE") || 100);
    const rows: BioTimeRecord[] = [];
    let url: string | null = path;
    let page = 1;
    let retriedAfterAuthFailure = false;
    let retriedAfterLicenseActivation = false;
    const visitedUrls = new Set<string>();
    const maxPages = maxPagesOverride || Number(this.config.get("BIOTIME_MAX_PAGES_PER_REQUEST") || 500);

    while (url) {
      if (visitedUrls.has(url)) {
        throw new Error(`Pagination BioTime interrompue: boucle détectée sur ${url} page ${page}.`);
      }

      if (page > maxPages) {
        throw new Error(`Pagination BioTime interrompue: limite de ${maxPages} pages dépassée pour ${path}.`);
      }

      visitedUrls.add(url);
      let response: AxiosResponse<BioTimeListResponse<BioTimeRecord> | BioTimeRecord[]>;

      try {
        response = await this.client.get(url, {
          params: url === path ? { page_size: pageSize, page, ...params } : undefined,
          headers: this.authHeaders()
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 403 && !retriedAfterLicenseActivation) {
          retriedAfterLicenseActivation = true;
          await this.reactivateLicenseAfter403(error);
          continue;
        }

        // Si le token est rejeté (expiré / invalide), on ré-authentifie une seule fois puis on relance.
        if (axios.isAxiosError(error) && error.response?.status === 401 && !retriedAfterAuthFailure) {
          retriedAfterAuthFailure = true;
          this.token = null;
          await this.authenticate();
          continue;
        }

        throw error;
      }

      const body: BioTimeListResponse<BioTimeRecord> | BioTimeRecord[] = response.data;
      const batch = Array.isArray(body) ? body : body.results || body.data || [];
      rows.push(...batch);
      url = Array.isArray(body) ? null : body.next || null;
      page += 1;

      if (onProgress) {
        onProgress(page - 1, rows.length);
      }
    }

    return rows;
  }

  private async authenticate(retriedAfterLicenseActivation = false): Promise<void> {
    if (this.token) {
      return;
    }

    const username = this.required("BIOTIME_USERNAME");
    const password = this.required("BIOTIME_PASSWORD");

    // Chaque endpoint BioTime/ZKTeco a un schéma d'autorisation différent pour les requêtes suivantes.
    // Certains de ces endpoints peuvent répondre 200 avec un champ "token"/"access" qui a l'air valide
    // mais qui ne fonctionne pas réellement avec le schéma associé (ex: /jwt-api-token-auth/ existe
    // sur certaines installations ZKTeco mais renvoie un jeton inutilisable pour les requêtes GET).
    // On ne fait donc plus confiance au premier candidat qui répond : on VÉRIFIE le token obtenu
    // avec une vraie requête GET avant de le considérer valide.
    const candidates: Array<{ path: string; scheme: string }> = [
      { path: "/jwt-api-token-auth/", scheme: "JWT" },
      { path: "/api-token-auth/", scheme: "Token" },
      { path: "/token/", scheme: "Bearer" }
    ];
    let lastError: unknown;

    for (const { path, scheme } of candidates) {
      try {
        const response = await this.client.post<Record<string, string>>(path, { username, password });
        const token = response.data.token || response.data.access || response.data.access_token || null;

        if (!token) {
          continue;
        }

        const verification = await this.verifyToken(token, scheme);

        if (verification === "valid") {
          this.token = token;
          this.authScheme = scheme;
          console.log(`BioTime: authentification réussie via ${path} (schéma ${scheme})`);
          return;
        }

        if (verification === "forbidden" && !retriedAfterLicenseActivation) {
          await this.reactivateLicenseAfter403(new Error("BioTime API 403 durant la vérification du token."));
          return this.authenticate(true);
        }

        console.log(`BioTime: token obtenu via ${path} mais rejeté à la vérification (schéma ${scheme} probablement incorrect)`);
      } catch (error) {
        lastError = error;
        console.log(`BioTime: échec sur ${path}:`, axios.isAxiosError(error) ? error.response?.status : error);
      }
    }

    throw new Error(`Authentification BioTime impossible: ${formatAxiosError(lastError)}`);
  }

  private async verifyToken(token: string, scheme: string): Promise<"valid" | "invalid" | "forbidden"> {
    try {
      await this.client.get("/personnel/api/employees/", {
        params: { page_size: 1, page: 1 },
        headers: { Authorization: `${scheme} ${token}` }
      });
      return "valid";
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        return "forbidden";
      }
      return "invalid";
    }
  }

  private async reactivateLicenseAfter403(originalError: unknown): Promise<void> {
    console.warn("BioTime API a répondu 403: tentative unique de réactivation licence.");
    try {
      await this.license.reactivate();
      this.token = null;
      await this.authenticate(true);
    } catch (reactivationError) {
      console.error("Réactivation licence BioTime impossible après 403.", reactivationError);
      throw originalError;
    }
  }

  private authHeaders() {
    return this.token ? { Authorization: `${this.authScheme} ${this.token}` } : {};
  }

  private buildSinceParams(value: string | undefined, fieldCandidates: string[]) {
    if (!value) {
      return {};
    }

    return Object.fromEntries(fieldCandidates.map(field => [`${field}__gte`, value]));
  }

  private required(key: string) {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new Error(`${key} est obligatoire pour la synchronisation BioTime.`);
    }

    return value;
  }
}

function formatAxiosError(error: unknown) {
  if (axios.isAxiosError(error)) {
    return `${error.response?.status || "network"} ${error.response?.statusText || error.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

function formatBioTimeDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").replace(/\.\d{3}Z$/, "");
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
