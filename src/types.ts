export interface TowingProcedure {
  year: string;
  make: string;
  model: string;
  towingMethod: string;
  drivetrain: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  steps: {
    preparation: string;
    neutral: string;
    securing: string;
  };
  warnings: string;
  verification: string;
  source: string;
}

export type AppMode = 'search' | 'voice';
