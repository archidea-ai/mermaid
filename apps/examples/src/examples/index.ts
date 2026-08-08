export interface DiagramExample {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly source: string;
}

/**
 * Adding an example is a data entry here — no component changes. That is the
 * point of the registry: the app never special-cases a diagram.
 */
export const examples: readonly DiagramExample[] = [
  {
    id: 'login-variables',
    title: 'Login — values drive the branch',
    description:
      'Pick a role and the alt fragment resolves itself. Values bound during the run are carried in the sidebar and reused later.',
    source: `sequenceDiagram
    autonumber
    actor User
    participant API
    participant DB

    User->>API: POST /login as {{role : "admin" | "member"}}
    API->>DB: lookup({{email : string}})
    DB-->>API: {{userId = "u-8842"}}
    alt {{role}} == "admin"
        API->>DB: loadAuditLog({{userId}})
        DB-->>API: 240 entries
        note over API,DB: Admins see the full audit trail
    else
        API-->>User: 200 OK
    end
    API-->>User: session for {{userId}}`,
  },
  {
    id: 'checkout-parallel',
    title: 'Checkout — parallel work and retries',
    description:
      'Parallel lanes interleave as you step, so the concurrency is visible. The loop and opt fragments are yours to choose.',
    source: `sequenceDiagram
    participant Client
    participant Orders
    participant Payments
    participant Email

    Client->>+Orders: POST /checkout
    par charge the card
        Orders->>Payments: authorise({{amount : number}})
        Payments-->>Orders: authorised
    and notify the customer
        Orders->>Email: queue receipt
        Email-->>Orders: queued
    end
    loop settlement retry
        Orders->>Payments: capture
    end
    opt {{sendSms : boolean}}
        Orders->>Email: send SMS too
    end
    Orders-->>-Client: 201 Created`,
  },
  {
    id: 'notes-and-lifecycle',
    title: 'Notes, activations and lifecycle',
    description:
      'Notes appear in the aside when their step is current, and on hover otherwise. Participants can be created and destroyed mid-run.',
    source: `sequenceDiagram
    actor Operator
    participant Scheduler

    Operator->>Scheduler: start job
    note right of Scheduler: The scheduler owns retries, not the operator
    create participant Worker
    Scheduler->>Worker: spawn
    activate Worker
    Worker->>Worker: process batch
    Worker-->>Scheduler: done
    deactivate Worker
    destroy Worker
    Scheduler-->>Operator: complete`,
  },
  {
    id: 'access-lifecycle',
    title: 'Access lifecycle — multi-party, three phases',
    description:
      'A deliberately large diagram: grouped participants, three phases, nested branches, a scoped region and a review loop. Pick the identity kind and the branch resolves itself; the rest are yours to choose.',
    source: `sequenceDiagram
    autonumber

    box rgb(225, 240, 255) Requesting side
        actor Requester as Requester
        actor Sponsor as Internal sponsor
    end
    box rgb(225, 245, 230) Platform
        participant Portal as Access portal
        participant Directory as Directory<br/>service
    end
    box rgb(255, 244, 224) External parties
        actor PartnerAdmin as Partner admin
        participant PartnerIdp as Partner identity<br/>provider
    end
    box rgb(225, 245, 230) Operations
        participant Audit as Audit log
        participant Billing as Billing
    end

    Note over Requester,Billing: Phase 1 - Request and triage

    Requester->>Sponsor: requestAccess(resource, {{duration : "30 days" | "90 days" | "permanent"}})
    Sponsor->>Portal: submitRequest(requestId, resource, duration)
    Portal->>Directory: lookupIdentity({{subject : string}}, {{identityKind : "external" | "internal"}})
    Directory-->>Portal: identityRecord(subjectRef, state)

    alt {{identityKind}} == "external"
        Portal->>PartnerAdmin: notifyPartner(requestId, resource)
        PartnerAdmin->>PartnerIdp: confirmAffiliation(subjectRef)
        PartnerIdp-->>PartnerAdmin: attestation(valid, expiresOn)
        PartnerAdmin-->>Portal: returnAttestation(requestId, valid)
        opt {{requiresStepUp : boolean}}
            Portal->>PartnerIdp: requestStrongAuth(subjectRef)
            PartnerIdp-->>Portal: assurance(level)
        end
    else
        Portal->>Directory: provisionLocalAccount(subjectRef)
        Directory-->>Portal: {{accountRef = "acct-4417"}}
        Note over Portal,Requester: The initial credential is never emailed - it is handed over out of band
    end

    Note over Requester,Billing: Phase 2 - Approval

    rect rgb(240, 240, 255)
        Portal->>Portal: evaluatePolicy(resource, duration)
        alt Low risk
            Portal->>Audit: recordAutoApproval(requestId)
        else Elevated risk
            Portal->>Sponsor: requestSecondApproval(requestId)
            Sponsor-->>Portal: decision(approve, reject)
        end
    end

    Portal->>+Directory: grantEntitlement(subjectRef, resource, duration)
    Directory-->>-Portal: {{entitlementRef = "ent-9F2C"}}
    Portal->>Audit: recordGrant(requestId, entitlementRef)
    Portal->>Billing: reportSeat(entitlementRef, duration)
    Portal->>Requester: notifyGranted(resource, entitlementRef)

    Note over Requester,Billing: Phase 3 - Review and expiry

    loop scheduled review
        Portal->>Sponsor: requestAttestation(entitlementRef)
        Sponsor-->>Portal: attest(keep, revoke)
    end

    alt Revoke
        Portal->>Directory: revokeEntitlement(entitlementRef)
        Portal->>Billing: releaseSeat(entitlementRef)
        Portal->>Audit: recordRevocation(entitlementRef)
    else Keep
        Portal->>Audit: recordRenewal(entitlementRef)
    end`,
  },
];
