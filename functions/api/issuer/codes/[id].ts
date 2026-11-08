import { requireIssuerSession } from '../../../_lib/auth'
import type { IssuerEnv } from '../../../_lib/config'
import { publicOrigin } from '../../../_lib/destinations'
import { HttpProblem, json, problem, requireDatabase } from '../../../_lib/http'
import { CODE_COLUMNS, toSafeCodeView } from '../../../_lib/issue'

type CodeRow = Parameters<typeof toSafeCodeView>[0]

export const onRequestGet: PagesFunction<IssuerEnv, 'id'> = async ({ request, env, params }) => {
  try {
    const session = await requireIssuerSession(request, env)
    const id = params.id
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || new URL(request.url).search) {
      throw new HttpProblem(404, 'NOT_FOUND', 'Code not found.')
    }
    const db = requireDatabase(env)
    const row = await db.prepare(`SELECT ${CODE_COLUMNS} FROM codes WHERE issuer_id = ? AND jti = ?`)
      .bind(session.issuerId, id).first<CodeRow>()
    if (!row) throw new HttpProblem(404, 'NOT_FOUND', 'Code not found.')
    return json({ code: toSafeCodeView(row, publicOrigin(env.TRUSEAL_PUBLIC_ORIGIN)) })
  } catch (error) { return problem(error) }
}
