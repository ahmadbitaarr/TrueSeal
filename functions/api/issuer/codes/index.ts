import { requireIssuerSession } from '../../../_lib/auth'
import type { IssuerEnv } from '../../../_lib/config'
import { publicOrigin } from '../../../_lib/destinations'
import { HttpProblem, json, problem, readJsonObject, requireDatabase, requireSameOrigin } from '../../../_lib/http'
import { CODE_COLUMNS, issueCode, toSafeCodeView } from '../../../_lib/issue'

type CodeRow = Parameters<typeof toSafeCodeView>[0]

export const onRequestPost: PagesFunction<IssuerEnv> = async ({ request, env }) => {
  try {
    requireSameOrigin(request)
    const session = await requireIssuerSession(request, env)
    const body = await readJsonObject(request)
    return json({ code: await issueCode(env, session, body) }, 201)
  } catch (error) { return problem(error) }
}

export const onRequestGet: PagesFunction<IssuerEnv> = async ({ request, env }) => {
  try {
    const session = await requireIssuerSession(request, env)
    const url = new URL(request.url)
    if (url.search) throw new HttpProblem(400, 'INVALID_REQUEST', 'Unsupported query parameters.')
    const db = requireDatabase(env)
    const result = await db.prepare(`SELECT ${CODE_COLUMNS} FROM codes WHERE issuer_id = ? ORDER BY issued_at DESC, jti DESC LIMIT 100`)
      .bind(session.issuerId).all<CodeRow>()
    if (!result.success) throw new Error('Code listing unavailable')
    const origin = publicOrigin(env.TRUSEAL_PUBLIC_ORIGIN)
    return json({ codes: result.results.map((item) => toSafeCodeView(item, origin)) })
  } catch (error) { return problem(error) }
}
