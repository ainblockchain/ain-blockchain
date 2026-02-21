import { NextResponse } from 'next/server';
import { buildAgentCard } from '@/lib/a2a';

export async function GET() {
  return NextResponse.json(buildAgentCard());
}
