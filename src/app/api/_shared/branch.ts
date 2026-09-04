import type { BranchId } from "@/lib/domain/types";

const branchIds: BranchId[] = ["centro", "norte", "sur"];

export function parseBranchId(value: string | null): BranchId {
  return branchIds.includes(value as BranchId) ? (value as BranchId) : "centro";
}
