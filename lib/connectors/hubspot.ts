import type {
  ConnectorSource,
  NormalizedExternalRecord,
} from "./types";

type HubSpotProperties = Record<string, unknown>;

export type HubSpotCompanyFixture = {
  id?: unknown;
  properties?: HubSpotProperties;
  createdAt?: unknown;
  updatedAt?: unknown;
  archived?: unknown;
  [key: string]: unknown;
};

export type HubSpotContactFixture = {
  id?: unknown;
  properties?: HubSpotProperties;
  associations?: {
    company_id?: unknown;
    [key: string]: unknown;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
  archived?: unknown;
  [key: string]: unknown;
};

export type HubSpotFixtureIssue = {
  entity: "company" | "contact";
  external_id: string | null;
  message: string;
};

export type HubSpotFixturePlan = {
  company_records: NormalizedExternalRecord[];
  contact_records: NormalizedExternalRecord[];
  valid_company_records: NormalizedExternalRecord[];
  valid_contact_records: NormalizedExternalRecord[];
  warnings: HubSpotFixtureIssue[];
  validation_errors: HubSpotFixtureIssue[];
};

const companyPropertyNames = new Set([
  "name",
  "domain",
  "industry",
  "lifecyclestage",
  "health_status",
  "hs_health_score",
  "owner_name",
  "annualrevenue",
  "renewal_date",
]);

const contactPropertyNames = new Set([
  "email",
  "firstname",
  "lastname",
  "jobtitle",
]);

export const hubSpotFixtureSource: ConnectorSource = {
  id: "hubspot-fixture",
  provider: "hubspot_fixture",
  name: "Synthetic HubSpot-Style Fixture",
  mode: "manual",
  workspace_external_id: "hubspot_fixture_workspace",
  metadata: {
    read_only: true,
    contains_synthetic_data_only: true,
  },
};

function toOptionalString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getProperties(record: {
  properties?: HubSpotProperties;
}): HubSpotProperties {
  return record.properties && typeof record.properties === "object"
    ? record.properties
    : {};
}

function getUnmappedProperties(
  properties: HubSpotProperties,
  knownProperties: Set<string>
) {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key, value]) =>
        !knownProperties.has(key) && value !== null && value !== ""
    )
  );
}

function buildProvenance(
  externalId: string,
  recordType: "company" | "contact",
  updatedAt: unknown,
  observedAt: string
) {
  return {
    connector_source_id: hubSpotFixtureSource.id,
    provider: hubSpotFixtureSource.provider,
    external_id: externalId,
    external_record_type: recordType,
    source_updated_at: toOptionalString(updatedAt),
    source_url: null,
    observed_at: observedAt,
  };
}

export function normalizeHubSpotCompany(
  company: HubSpotCompanyFixture,
  observedAt = new Date().toISOString()
): NormalizedExternalRecord {
  const properties = getProperties(company);
  const externalId = toOptionalString(company.id) ?? "";
  const healthStatus = toOptionalString(properties.health_status);
  const healthScore = toOptionalString(properties.hs_health_score);
  const annualRevenue = toOptionalString(properties.annualrevenue);
  const renewalDate = toOptionalString(properties.renewal_date);

  return {
    record_type: "account",
    raw_payload: { ...company },
    canonical_fields: {
      name: toOptionalString(properties.name),
      domain: toOptionalString(properties.domain)?.toLowerCase() ?? null,
      industry: toOptionalString(properties.industry),
      stage: toOptionalString(properties.lifecyclestage),
      health_status: healthStatus?.toLowerCase() ?? null,
      health_score: healthScore,
      owner_name: toOptionalString(properties.owner_name),
      annual_revenue: annualRevenue,
      renewal_date: renewalDate,
    },
    metadata: {
      source: "hubspot_fixture",
      unmapped_properties: getUnmappedProperties(
        properties,
        companyPropertyNames
      ),
    },
    provenance: buildProvenance(
      externalId,
      "company",
      company.updatedAt,
      observedAt
    ),
  };
}

export function normalizeHubSpotContact(
  contact: HubSpotContactFixture,
  observedAt = new Date().toISOString()
): NormalizedExternalRecord {
  const properties = getProperties(contact);
  const externalId = toOptionalString(contact.id) ?? "";
  const firstName = toOptionalString(properties.firstname);
  const lastName = toOptionalString(properties.lastname);
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    record_type: "contact",
    raw_payload: { ...contact },
    canonical_fields: {
      email: toOptionalString(properties.email)?.toLowerCase() ?? null,
      name,
      contact_role: toOptionalString(properties.jobtitle),
      account_external_id:
        toOptionalString(contact.associations?.company_id) ?? null,
    },
    metadata: {
      source: "hubspot_fixture",
      unmapped_properties: getUnmappedProperties(
        properties,
        contactPropertyNames
      ),
    },
    provenance: buildProvenance(
      externalId,
      "contact",
      contact.updatedAt,
      observedAt
    ),
  };
}

function canonicalString(
  record: NormalizedExternalRecord,
  field: string
): string | null {
  return toOptionalString(record.canonical_fields[field]);
}

export function buildHubSpotFixturePlan({
  companies,
  contacts,
  observedAt = new Date().toISOString(),
}: {
  companies: HubSpotCompanyFixture[];
  contacts: HubSpotContactFixture[];
  observedAt?: string;
}): HubSpotFixturePlan {
  const companyRecords = companies.map((company) =>
    normalizeHubSpotCompany(company, observedAt)
  );
  const contactRecords = contacts.map((contact) =>
    normalizeHubSpotContact(contact, observedAt)
  );
  const warnings: HubSpotFixtureIssue[] = [];
  const validationErrors: HubSpotFixtureIssue[] = [];
  const validCompanyRecords: NormalizedExternalRecord[] = [];
  const validContactRecords: NormalizedExternalRecord[] = [];
  const companyExternalIds = new Set(
    companyRecords
      .map((record) => record.provenance.external_id)
      .filter(Boolean)
  );

  for (const record of companyRecords) {
    const externalId = record.provenance.external_id || null;

    if (!externalId) {
      validationErrors.push({
        entity: "company",
        external_id: null,
        message: "Company is missing a required external id.",
      });
      continue;
    }

    if (!canonicalString(record, "name")) {
      validationErrors.push({
        entity: "company",
        external_id: externalId,
        message: "Company is missing required property: name.",
      });
      continue;
    }

    validCompanyRecords.push(record);
  }

  for (const record of contactRecords) {
    const externalId = record.provenance.external_id || null;
    const email = canonicalString(record, "email");
    const accountExternalId = canonicalString(
      record,
      "account_external_id"
    );

    if (!externalId) {
      validationErrors.push({
        entity: "contact",
        external_id: null,
        message: "Contact is missing a required external id.",
      });
      continue;
    }

    if (!email) {
      const issue = {
        entity: "contact" as const,
        external_id: externalId,
        message: "Contact is missing required property: email; row skipped.",
      };
      warnings.push(issue);
      validationErrors.push(issue);
      continue;
    }

    if (!accountExternalId) {
      warnings.push({
        entity: "contact",
        external_id: externalId,
        message:
          "Contact has no associated company; account link will be skipped.",
      });
    } else if (!companyExternalIds.has(accountExternalId)) {
      warnings.push({
        entity: "contact",
        external_id: externalId,
        message: `Associated company ${accountExternalId} is missing from the fixture; the importer will check existing accounts.`,
      });
    }

    validContactRecords.push(record);
  }

  return {
    company_records: companyRecords,
    contact_records: contactRecords,
    valid_company_records: validCompanyRecords,
    valid_contact_records: validContactRecords,
    warnings,
    validation_errors: validationErrors,
  };
}
