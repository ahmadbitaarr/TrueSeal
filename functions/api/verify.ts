import type { IssuerEnv } from '../_lib/config'
import { HttpProblem, json, problem, readJsonObject } from '../_lib/http'
import { verifyPublicQr } from '../_lib/verify'

export const onRequestPost: PagesFunction<IssuerEnv> = async ({ request, env }) => {
  try {
    const body = await readJsonObject(request, 11000)
    if (Object.keys(body).length !== 1 || typeof body.value !== 'string') {
      throw new HttpProblem(400, 'INVALID_REQUEST', 'A QR value is required.')
    }
    const verified = await verifyPublicQr(env, body.value)
    return json(verified, verified.status === 'UNAVAILABLE' ? 503 : 200)
  } catch (error) { return problem(error) }
}
