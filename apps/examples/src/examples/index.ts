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
    opt {{sendSms}}
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
];
