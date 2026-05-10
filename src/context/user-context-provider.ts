import type { AuthenticatedUser, UserContext } from '../domain/types.js'

export interface UserContextProvider {
  buildForUser(user: AuthenticatedUser): Promise<UserContext>
}

export class InMemoryUserContextProvider implements UserContextProvider {
  async buildForUser(user: AuthenticatedUser): Promise<UserContext> {
    return {
      generatedAt: new Date().toISOString(),
      user,
      pages: [
        { path: '/projects', title: 'Projects' },
        { path: '/quote-requests', title: 'Quote Requests' },
        { path: '/vendor-directory', title: 'Vendor Directory' },
      ],
      data: {
        projects: [{ id: 'project-rialto-yard', name: 'Rialto Yard Renovation', location: 'Los Angeles, CA' }],
        quoteRequests: [{
          id: 'qr-doors-001',
          projectId: 'project-rialto-yard',
          title: 'Door Hardware Package',
          status: 'comparison',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          vendorInvitationCount: 3,
          responseCount: 3,
        }],
        comparisonSheets: [{
          id: 'sheet-doors-001',
          quoteRequestId: 'qr-doors-001',
          title: 'Door Hardware Quote Comparison',
          unresolvedReviewHighlightCount: 2,
          updatedAt: new Date().toISOString(),
        }],
        vendorDirectory: [
          {
            id: 'vendor-acme',
            name: 'Acme Supply',
            contacts: [{ id: 'contact-acme-estimating', name: 'Acme Estimating', email: 'quotes@acme.example' }],
          },
          {
            id: 'vendor-buildpro',
            name: 'BuildPro Materials',
            contacts: [{ id: 'contact-buildpro', name: 'Brian', email: 'brian@buildpro.example' }],
          },
        ],
      },
      procurementMemory: {
        preferredEmailTone: 'brief, specific, estimator-style',
        materialNamingPatterns: ['door hardware set', 'hollow metal frame', 'lever lockset'],
        unitNormalizationHints: ['EA and each usually match after estimator review'],
        recentSelectedVendors: [{
          vendorId: 'vendor-acme',
          materialDescription: 'Door hardware',
          selectedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        }],
      },
    }
  }
}
