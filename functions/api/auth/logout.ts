import { expiredCookie, invalidateSession } from '../../_lib/auth'
import type { IssuerEnv } from '../../_lib/config'
import { problem, requireSameOrigin } from '../../_lib/http'

export const onRequestPost: PagesFunction<IssuerEnv> = async ({ request, env }) => {
  try {
    requireSameOrigin(request)
    await invalidateSession(request, env)
    return new Response(null, {
      status: 204,
      headers: {
        'set-cookie': expiredCookie(),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) { return problem(error) }
}
