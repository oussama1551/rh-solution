import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SAP_EMPLOYEES_QUERY, sapPayrollLinesQuery } from "./sap-query";
import { SapEmployee, SapPayrollLine } from "./sap.types";

@Injectable()
export class SapHanaClientService {
  constructor(private readonly config: ConfigService) {}

  async listEmployees(): Promise<SapEmployee[]> {
    return this.execute<SapEmployee>(SAP_EMPLOYEES_QUERY);
  }

  async listPayrollLines(period: string): Promise<SapPayrollLine[]> {
    return this.execute<SapPayrollLine>(sapPayrollLinesQuery(period));
  }

  private async execute<T>(query: string): Promise<T[]> {
    const hana = await import("@sap/hana-client");
    const connection = hana.createConnection();
    const params = {
      serverNode: `${this.required("SAP_HANA_HOST")}:${this.config.get("SAP_HANA_PORT") || 30015}`,
      uid: this.required("SAP_HANA_USERNAME"),
      pwd: this.required("SAP_HANA_PASSWORD"),
      databaseName: this.config.get("SAP_HANA_DATABASE") || undefined
    };

    return new Promise((resolve, reject) => {
      connection.connect(params, error => {
        if (error) {
          reject(error);
          return;
        }

        connection.exec(query, (queryError, rows: T[]) => {
          connection.disconnect();

          if (queryError) {
            reject(queryError);
            return;
          }

          resolve(rows || []);
        });
      });
    });
  }

  private required(key: string) {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`${key} est obligatoire pour l'intégration SAP HANA.`);
    return value;
  }
}
