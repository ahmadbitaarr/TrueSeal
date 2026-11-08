import { requireIssuerSession } from '../../_lib/auth'
import type { IssuerEnv } from '../../_lib/config'
import { json, problem } from '../../_lib/http'

export const onRequestGet: PagesFunction<IssuerEnv> = async ({ request, env }) => {
  try { return json({ issuer: await requireIssuerSession(request, env) }) }
  catch (error) { return problem(error) }
}
