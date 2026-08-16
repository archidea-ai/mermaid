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
  {
    id: 'order-state',
    title: 'Order state machine — pick the next transition',
    description:
      'A state diagram. You stand in a state and choose which transition to take; a labelled condition takes itself once the value is known. A state with a note shows it underneath while you are there.',
    source: `stateDiagram-v2
    direction LR

    [*] --> Draft
    Draft --> Submitted: submit
    Submitted --> Screening: {{channel = "online"}}

    state Screening <<choice>>
    Screening --> Approved: {{risk}} == "low"
    Screening --> Review: {{risk}} == "high"

    Review --> Approved: accept
    Review --> Rejected: decline

    Approved --> Fulfilled: ship
    Fulfilled --> [*]
    Rejected --> [*]

    note right of Screening: Automatic — the risk score decides, no one clicks.
    note right of Review: A human reads the file here. Expect it to sit for a day.`,
  },
  {
    id: 'deploy-state',
    title: 'Deployment machine — nested compound states',
    description:
      'Only the state you are in is drawn, with one line per way out. Click a line to take it. While you are inside a compound state it is drawn as a box around the view — and a box inside a box when they nest.',
    source: `stateDiagram-v2
    [*] --> Queued
    Queued --> Building: pick up

    state Building {
        [*] --> Compiling
        Compiling --> Testing: compiled

        state Testing {
            [*] --> Unit
            Unit --> Integration: unit green
            Unit --> Failed: unit red
            Integration --> Passed: all green
            Integration --> Failed: integration red
        }

        Passed --> Packaging: package
        Failed --> [*]
    }

    Building --> Cancelled: abort

    Packaging --> Deploying: upload
    Deploying --> Live: health check ok
    Deploying --> RolledBack: health check failed
    Live --> [*]
    RolledBack --> [*]
    Cancelled --> [*]`,
  },
  {
    id: 'release-flowchart',
    title: 'Release pipeline — a flowchart to explore',
    description:
      'A flowchart is a map rather than a run, so there is one view: the whole chart, in dependency order. Click a node to light it, everything one edge away, and the edges between them.',
    source: `flowchart LR
    Commit([Commit pushed]) --> Lint[Lint and typecheck]
    Lint --> Unit[Unit tests]

    subgraph gates [Quality gates]
        Unit --> Coverage{Coverage >= 80%?}
        Coverage -- no --> Fail[/Report and stop/]
        Coverage -- yes --> Bundle[Build bundle]
    end

    Bundle --> Sign[[Sign artefacts]]
    Sign --> Stage[(Publish to staging)]
    Stage --> Smoke{Smoke tests pass?}
    Smoke -- no --> Rollback[Roll back staging]
    Smoke -- yes --> Approve[Await approval]
    Approve --> Prod[(Publish to production)]
    Prod --> Announce([Announce release])
    Rollback --> Lint`,
  },
  {
    id: 'incident-flowchart',
    title: 'Incident triage — a top-down flowchart',
    description:
      'The same renderer reading `flowchart TD`: written downwards, drawn downwards. Arrowheads say which way each edge runs, and the shapes an author chose are kept.',
    source: `flowchart TD
    Alert([Alert fires]) --> Ack[/Acknowledge/]
    Ack --> Triage{Customer impact?}
    Triage -- none --> Watch[Watch and close]
    Triage -- some --> Page[[Page the on-call]]
    Page --> Mitigate[Apply mitigation]
    Mitigate --> Check{Recovered?}
    Check -- no --> Escalate>Escalate to incident lead]
    Escalate --> Mitigate
    Check -- yes --> Record[(Write the postmortem)]
    Record --> Close([Close incident])`,
  },
  {
    id: 'c4-context',
    title: 'Big Bank plc — system context',
    description:
      'Everything starts shut. Open Customer Channels and five relations that were one aggregated line become five.',
    source: `C4Context
    title Big Bank plc — system context

    Person(customer, "Personal Banking Customer", "A customer of the bank, with personal bank accounts.")

    Enterprise_Boundary(bank, "Big Bank plc") {
        Person_Ext(support, "Customer Service Staff", "Customer service staff within the bank.")
        Person(backoffice, "Back Office Staff", "Administration and support staff within the bank.")

        System_Boundary(channels, "Customer Channels") {
            System(banking, "Internet Banking System", "Allows customers to view information about their bank accounts and make payments.")
            System(mobileGw, "Mobile Gateway", "Serves the iOS and Android apps.")
            System(atm, "ATM Network", "Allows customers to withdraw cash.")
        }

        System(mainframe, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts and transactions.")
        SystemDb(warehouse, "Data Warehouse", "Reporting and analytics over historical transactions.")
        System_Ext(email, "E-mail System", "The internal Microsoft Exchange e-mail system.")
    }

    Rel(customer, banking, "Views account balances and makes payments using", "HTTPS")
    Rel(customer, mobileGw, "Views account balances using", "HTTPS")
    Rel(customer, atm, "Withdraws cash using")
    Rel(customer, support, "Asks questions to", "Telephone")
    Rel(banking, mainframe, "Gets account information from", "XML/HTTPS")
    Rel(mobileGw, mainframe, "Gets account information from", "XML/HTTPS")
    Rel(atm, mainframe, "Gets account information from")
    Rel(support, mainframe, "Uses")
    Rel(backoffice, mainframe, "Uses")
    Rel(mainframe, warehouse, "Streams transactions to", "Kafka")
    Rel(banking, email, "Sends e-mail using", "SMTP")
    Rel(email, customer, "Sends e-mails to")
    Rel(mobileGw, customer, "Sends push notifications to", "APNs, FCM")

    UpdateElementStyle(customer, $bgColor="#1168bd", $fontColor="#ffffff")`,
  },
  {
    id: 'c4-container',
    title: 'Internet Banking — containers',
    description:
      'Two relations run API → Database and two run both ways to the event bus, so lines aggregate even with the boundary open.',
    source: `C4Container
    title Internet Banking System — containers

    Person(customer, "Banking Customer", "A customer of the bank, with personal bank accounts.")

    System_Boundary(banking, "Internet Banking System") {
        Container(web, "Web Application", "Java, Spring MVC", "Delivers the static content and the single-page application.")
        Container(spa, "Single-Page Application", "JavaScript, Angular", "Provides the banking functionality in the browser.")
        Container(mobile, "Mobile App", "Kotlin, Android", "Provides a subset of the banking functionality to the customer's phone.")
        Container(api, "API Application", "Java, Spring MVC", "Provides banking functionality via a JSON/HTTPS API.")
        ContainerDb(db, "Database", "Oracle 19c", "Stores user registration information, hashed authentication credentials and access logs.")
        ContainerQueue(events, "Event Bus", "Kafka", "Carries account and payment events to downstream consumers.")
    }

    System_Ext(email, "E-mail System", "The internal Microsoft Exchange e-mail system.")
    System_Ext(mainframe, "Mainframe Banking System", "Stores all of the core banking information.")

    Rel(customer, web, "Visits bigbank.com using", "HTTPS")
    Rel(customer, spa, "Views account balances and makes payments using", "HTTPS")
    Rel(customer, mobile, "Views account balances using")
    Rel(web, spa, "Delivers to the customer's web browser")
    Rel(spa, api, "Makes API calls to", "JSON/HTTPS")
    Rel(mobile, api, "Makes API calls to", "JSON/HTTPS")
    Rel(api, db, "Reads from and writes to", "JDBC")
    Rel(api, db, "Writes access logs to", "JDBC")
    Rel(api, events, "Publishes account events to", "Kafka")
    Rel(events, api, "Delivers payment settlements to", "Kafka")
    Rel(api, mainframe, "Makes API calls to", "XML/HTTPS")
    Rel(api, email, "Sends e-mail using", "SMTP")
    Rel(email, customer, "Sends e-mails to")
    Rel(mobile, customer, "Sends push notifications to", "FCM")`,
  },
  {
    id: 'c4-component',
    title: 'API Application — components',
    description:
      'A boundary inside a boundary. Shut Domain Services and three controllers each keep a counted line into it.',
    source: `C4Component
    title API Application — components

    Container_Boundary(api, "API Application") {
        Component(signin, "Sign In Controller", "Spring MVC REST Controller", "Allows users to sign in to the internet banking system.")
        Component(accounts, "Accounts Summary Controller", "Spring MVC REST Controller", "Provides customers with a summary of their bank accounts.")
        Component(reset, "Reset Password Controller", "Spring MVC REST Controller", "Allows users to reset their passwords with a single-use URL.")

        Container_Boundary(services, "Domain Services") {
            Component(security, "Security Component", "Spring Bean", "Provides functionality related to signing in, changing passwords, and so on.")
            Component(mailer, "E-mail Component", "Spring Bean", "Sends e-mails to users.")
            Component(facade, "Mainframe Facade", "Spring Bean", "A facade onto the mainframe banking system.")
            Component(audit, "Audit Component", "Spring Bean", "Records who did what, and when.")
        }
    }

    ContainerDb(db, "Database", "Oracle 19c", "Stores user registration information and hashed credentials.")
    System_Ext(mainframe, "Mainframe Banking System", "Stores all of the core banking information.")
    System_Ext(email, "E-mail System", "The internal Microsoft Exchange e-mail system.")
    Container(spa, "Single-Page Application", "JavaScript, Angular", "Provides the banking functionality in the browser.")

    Rel(spa, signin, "Makes API calls to", "JSON/HTTPS")
    Rel(spa, accounts, "Makes API calls to", "JSON/HTTPS")
    Rel(spa, reset, "Makes API calls to", "JSON/HTTPS")
    Rel(signin, security, "Uses")
    Rel(accounts, facade, "Uses")
    Rel(reset, security, "Uses")
    Rel(reset, mailer, "Uses")
    Rel(signin, audit, "Records sign-ins with")
    Rel(reset, audit, "Records resets with")
    Rel(accounts, audit, "Records reads with")
    Rel(security, db, "Reads from and writes to", "JDBC")
    Rel(audit, db, "Writes to", "JDBC")
    Rel(facade, mainframe, "Makes API calls to", "XML/HTTPS")
    Rel(mailer, email, "Sends e-mail using", "SMTP")`,
  },
  {
    id: 'c4-deployment',
    title: 'Internet Banking — production deployment',
    description:
      'Deployment nodes three deep. Shut the data centre and database replication becomes an internal relation, counted rather than drawn.',
    source: `C4Deployment
    title Internet Banking System — production deployment

    Deployment_Node(customerDevice, "Customer's Computer", "Microsoft Windows or Apple macOS") {
        Deployment_Node(browser, "Web Browser", "Chrome, Firefox, Safari or Edge") {
            Container(spa, "Single-Page Application", "JavaScript, Angular", "Provides the banking functionality in the browser.")
        }
    }

    Deployment_Node(customerPhone, "Customer's Mobile Device", "Apple iOS or Android") {
        Container(mobile, "Mobile App", "Kotlin, Android", "Provides a subset of the banking functionality.")
    }

    Deployment_Node(datacentre, "Big Bank plc", "Big Bank plc data centre") {
        Deployment_Node(apiCluster, "bigbank-api***", "Ubuntu 20.04 LTS", "A cluster of four API hosts") {
            Deployment_Node(tomcat, "Apache Tomcat", "Apache Tomcat 8.x") {
                Container(api, "API Application", "Java, Spring MVC", "Provides banking functionality via a JSON/HTTPS API.")
            }
        }
        Deployment_Node(webCluster, "bigbank-web***", "Ubuntu 20.04 LTS", "A cluster of four web hosts") {
            Deployment_Node(tomcatWeb, "Apache Tomcat", "Apache Tomcat 8.x") {
                Container(web, "Web Application", "Java, Spring MVC", "Delivers the static content and the single-page application.")
            }
        }
        Deployment_Node(primaryDb, "bigbank-db01", "Ubuntu 20.04 LTS", "The primary database server") {
            ContainerDb(primary, "Database", "Oracle 19c", "Stores user registration information and hashed credentials.")
        }
        Deployment_Node(secondaryDb, "bigbank-db02", "Ubuntu 20.04 LTS", "The failover database server") {
            ContainerDb(secondary, "Database", "Oracle 19c", "A read replica of the primary.")
        }
    }

    Rel(spa, api, "Makes API calls to", "JSON/HTTPS")
    Rel(mobile, api, "Makes API calls to", "JSON/HTTPS")
    Rel(web, spa, "Delivers to the customer's web browser")
    Rel(api, primary, "Reads from and writes to", "JDBC")
    Rel(api, secondary, "Reads from", "JDBC")
    Rel(primary, secondary, "Replicates data to")`,
  },
  {
    id: 'c4-dynamic',
    title: 'Reset password — the order of calls',
    description:
      'A numbered run. Every step opens whatever hides its ends, and steps 2 and 4 walk the same pair in opposite directions.',
    source: `C4Dynamic
    title Reset password — the order of calls

    Container(spa, "Single-Page Application", "JavaScript, Angular", "Provides the banking functionality in the browser.")

    Container_Boundary(api, "API Application") {
        Component(reset, "Reset Password Controller", "Spring MVC REST Controller", "Allows users to reset their passwords.")
        Component(security, "Security Component", "Spring Bean", "Provides functionality related to signing in and changing passwords.")
        Component(mailer, "E-mail Component", "Spring Bean", "Sends e-mails to users.")
    }

    ContainerDb(db, "Database", "Oracle 19c", "Stores user registration information, hashed credentials and reset tokens.")
    System_Ext(email, "E-mail System", "The internal Microsoft Exchange e-mail system.")

    Rel(spa, reset, "Submits the e-mail address to", "JSON/HTTPS")
    Rel(reset, security, "Validates the e-mail address using")
    Rel(security, db, "select * from users where email = ?", "JDBC")
    Rel(security, reset, "Returns the user, or nothing")
    Rel(reset, security, "Requests a single-use reset token from")
    Rel(security, db, "insert into reset_tokens …", "JDBC")
    Rel(reset, mailer, "Requests a reset e-mail from")
    Rel(mailer, email, "Sends the e-mail using", "SMTP")`,
  },
];
