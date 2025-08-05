import { NextResponse } from "next/server";

const riskAlertsData = [
    {
        id: 'L-001',
        name: 'Lake Tsho Rolpa',
        riskLevel: 'High',
        lastUpdated: '2025-08-04',
    },
    {
        id: 'L-002',
        name: 'Lake Dig Tsho',
        riskLevel: 'High',
        lastUpdated: '2025-08-04',
    },
    {
        id: 'L-003',
        name: 'Lake Imja',
        riskLevel: 'Moderate',
        lastUpdated: '2025-08-04',
    },
    {
        id: 'L-004',
        name: 'Lake Thulagi',
        riskLevel: 'Moderate',
        lastUpdated: '2025-08-04',
    },
];

export async function GET() {
  // In a real application, you would fetch this from your master database.
  return NextResponse.json(riskAlertsData);
}