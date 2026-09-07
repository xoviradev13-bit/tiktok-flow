import { v4 as uuidv4 } from "uuid";

export function generateId(): string {
  return uuidv4();
}

export const normalizeForComparison = (fields: readonly string[], data: any) => {
  if (!data) return {};
  const normalized = { ...data };
  
  // Remove metadata fields that shouldn't trigger sync warnings
  fields.forEach(field => delete normalized[field]);
  
  // Convert null to undefined for consistent comparison
  Object.keys(normalized).forEach(key => {
    if (normalized[key] === null) {
      delete normalized[key];
    }
  });
  
  return normalized;
};

export const deepEqual = (obj1: any, obj2: any): boolean => {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
};
