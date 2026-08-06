import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.shift.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        _count: {
          select: { assignments: true }
        }
      }
    });
  }
}
