import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Pages publiques accessibles sans connexion
  const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
  if (!user && !publicPaths.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Utilisateur connecté sur /login → rediriger selon son rôle
  if (user && pathname === '/login') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const url = request.nextUrl.clone();
    url.pathname = profile?.role === 'employee' ? '/employee' : '/';
    return NextResponse.redirect(url);
  }

  // Employé qui tente d'accéder aux pages admin → rediriger vers /employee
  const publicPagesForAll = ['/login', '/forgot-password', '/reset-password', '/register'];
  if (user && !pathname.startsWith('/employee') && !publicPagesForAll.includes(pathname)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role === 'employee') {
      const url = request.nextUrl.clone();
      url.pathname = '/employee';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Exclure les fichiers statiques, images, PWA (sw.js, manifest.json) et icônes
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|apple-touch-icon\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
