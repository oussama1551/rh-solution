import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.device.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }]
    });
  }

  async get(id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });

    if (!device) {
      throw new NotFoundException("Terminal introuvable.");
    }

    return device;
  }
}
