import { type NextRequest, NextResponse } from 'next/server';
import { supabase } from '~/utils/supabaseClient';
import { db } from '~/server/db';

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    
    // Verify the Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    console.log('User authenticated:', user.id, user.email);

    // Get the request body
    const body = await request.json() as { provider_token: string; provider_refresh_token?: string };
    const { provider_token, provider_refresh_token } = body;

    if (!provider_token) {
      console.error('No provider token provided');
      return NextResponse.json({ error: 'Provider token required' }, { status: 400 });
    }

    console.log('Storing tokens for user:', user.id);

    // Store the Google tokens in the database
    const result = await db.users.upsert({
      where: { id: user.id },
      update: {
        google_access_token: provider_token,
        google_refresh_token: provider_refresh_token ?? null,
        google_token_expires_at: new Date(Date.now() + 3600 * 1000), // 1 hour from now
      },
      create: {
        id: user.id,
        email: user.email!,
        name: (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string) ?? null,
        google_access_token: provider_token,
        google_refresh_token: provider_refresh_token ?? null,
        google_token_expires_at: new Date(Date.now() + 3600 * 1000), // 1 hour from now
      },
    });

    console.log('Tokens stored successfully for user:', result.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing Google tokens:', error);
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
} 