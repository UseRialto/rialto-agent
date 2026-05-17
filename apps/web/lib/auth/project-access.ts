import type { SessionPayload } from '@/lib/auth/types'
import type { ContractorProject } from '@/lib/types/contractor'

export function canAccessContractorProject(
  session: Pick<SessionPayload, 'userId' | 'role'> | null | undefined,
  project: Pick<ContractorProject, 'owner_id' | 'collaborator_ids'> | null | undefined,
) {
  if (!session || session.role !== 'contractor' || !project) return false
  return project.owner_id === session.userId || (project.collaborator_ids ?? []).includes(session.userId)
}
