import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const protectedRoutes = [
  '/dashboard',
  '/leads',
  '/importacao-leads',
  '/cadastros',
  '/pipeline',
  '/pos-vendas',
  '/tarefas',
  '/propostas',
  '/relatorios',
  '/usuarios',
  '/configuracoes',
]

const authRoutes = ['/login']

function isProtectedRoute(pathname: string) {
  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

function isAuthRoute(pathname: string) {
  return authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

function canAccessRoute(pathname: string, nivelAcesso: string) {
  if (nivelAcesso === 'administrador') {
    return true
  }

  if (nivelAcesso === 'operacional') {
    const allowedRoutes = [
      '/dashboard',
      '/leads',
      '/pipeline',
      '/pos-vendas',
      '/tarefas',
      '/relatorios',
    ]

    const blockedRoutes = [
      '/importacao-leads',
      '/cadastros',
      '/usuarios',
      '/configuracoes',
      '/relatorios/marketing',
      '/relatorios/marketing/google',
      '/relatorios/marketing/organico-retorno',
      '/relatorios/marketing/comparativo',
    ]

    const isBlocked = blockedRoutes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )

    if (isBlocked) {
      return false
    }

    return allowedRoutes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )
  }

  if (nivelAcesso === 'consulta') {
    const blockedRoutes = [
      '/importacao-leads',
      '/cadastros',
      '/usuarios',
      '/configuracoes',
    ]

    const isBlocked = blockedRoutes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )

    if (isBlocked) {
      return false
    }

    return true
  }

  return false
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const pathname = request.nextUrl.pathname

  const acessoDiretoAoCrm =
    host.includes('crm-ergotex.vercel.app') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/_next') &&
    pathname !== '/favicon.ico'

  if (acessoDiretoAoCrm) {
    return NextResponse.redirect('https://ergotex-one.vercel.app')
  }

  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

    if (isProtectedRoute(pathname) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectedFrom', pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthRoute(pathname) && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  if (user && isProtectedRoute(pathname)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('nivel_acesso, ativo')
      .eq('id', user.id)
      .single()

    const nivelAcesso = profile?.nivel_acesso || 'consulta'
    const ativo = profile?.ativo ?? true

    if (!ativo) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    if (!canAccessRoute(pathname, nivelAcesso)) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}