import { cookieForToken, createSession } from '../../_lib/auth'
import type { IssuerEnv } from '../../_lib/config'
import { HttpProblem, json, problem, readJsonObject, requireSameOrigin } from '../../_lib/http'

export const onRequestPost: PagesFunction<IssuerEnv> = async ({ request, env }) => {
  try {
    requireSameOrigin(request)
    const body = await readJsonObject(request)
    if (Object.keys(body).length !== 1 || !('accessKey' in body)) {
      throw new HttpProblem(400, 'INVALID_REQUEST', 'Access key required.')
    }
    const { token, issuer } = await createSession(request, env, body.accessKey)
    return json({ issuer }, 200, { 'set-cookie': cookieForToken(token) })
  } catch (error) { return problem(error) }
}
