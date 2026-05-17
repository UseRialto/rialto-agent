import { describe, expect, it } from 'vitest'
import { canAccessContractorProject } from './project-access'

describe('canAccessContractorProject', () => {
  const project = {
    owner_id: 'owner-1',
    collaborator_ids: ['collab-1'],
  }

  it('allows the project owner', () => {
    expect(canAccessContractorProject({ userId: 'owner-1', role: 'contractor' }, project)).toBe(true)
  })

  it('allows project collaborators', () => {
    expect(canAccessContractorProject({ userId: 'collab-1', role: 'contractor' }, project)).toBe(true)
  })

  it('rejects other contractors, vendors, and missing sessions', () => {
    expect(canAccessContractorProject({ userId: 'other-1', role: 'contractor' }, project)).toBe(false)
    expect(canAccessContractorProject({ userId: 'collab-1', role: 'vendor' }, project)).toBe(false)
    expect(canAccessContractorProject(null, project)).toBe(false)
  })
})
