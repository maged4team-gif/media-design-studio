import { NextResponse } from 'next/server';

/**
 * Maps known link-management errors to user-facing responses:
 * VALIDATION → 400, MIGRATION_REQUIRED → 409 (prefix stripped, Arabic message kept).
 */
export function mapLinkError(error: unknown): NextResponse | null {
  const message = String((error as { message?: string })?.message || '');
  if (message.startsWith('VALIDATION:')) {
    return NextResponse.json({ error: message.replace(/^VALIDATION:\s*/, '') }, { status: 400 });
  }
  if (message.startsWith('MIGRATION_REQUIRED:')) {
    return NextResponse.json({ error: message.replace(/^MIGRATION_REQUIRED:\s*/, '') }, { status: 409 });
  }
  return null;
}
