type SubjectMetadataLike = {
  subject?: string;
  subject_slug?: string;
  subject_code?: string;
};

type SubjectGroup = {
  canonicalName: string;
  canonicalSlug: string;
  aliases: string[];
};

const SUBJECT_GROUPS: SubjectGroup[] = [
  {
    canonicalName: 'Digital Electronics',
    canonicalSlug: 'digital-electronics',
    aliases: ['digital electronics']
  },
  {
    canonicalName: 'Data Structure & Algorithms',
    canonicalSlug: 'data-structure-and-algorithms',
    aliases: [
      'data structure and algorithms',
      'data structures and algorithms',
      'data structure algorithms',
      'data structures'
    ]
  },
  {
    canonicalName: 'Object Oriented Programming Using Java',
    canonicalSlug: 'object-oriented-programming-using-java',
    aliases: [
      'object oriented programming using java',
      'object oriented programming',
      'object oriental programming',
      'introduction to java programming language'
    ]
  },
  {
    canonicalName: 'Discrete Mathematics and Graph Theory',
    canonicalSlug: 'discrete-mathematics-and-graph-theory',
    aliases: [
      'discrete mathematics and graph theory',
      'discrete mathematical structure and graph theory',
      'discrete mathematical structures',
      'discrete mathematics'
    ]
  },
  {
    canonicalName: 'Operating Systems',
    canonicalSlug: 'operating-systems',
    aliases: ['operating systems', 'operating system']
  },
  {
    canonicalName: 'Universal Human Values',
    canonicalSlug: 'universal-human-values',
    aliases: ['universal human values', 'human values']
  },
  {
    canonicalName: 'Engineering Graphics and Design',
    canonicalSlug: 'engineering-graphics-and-design',
    aliases: ['engineering graphics and design', 'engineering graphics design']
  },
  {
    canonicalName: 'Engineering Chemistry',
    canonicalSlug: 'engineering-chemistry',
    aliases: ['engineering chemistry', 'engg chemistry']
  }
];

export function slugifySubjectName(value = '') {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export function normalizeSubjectName(value = '') {
  return slugifySubjectName(value).replace(/-/g, ' ').trim();
}

function getSubjectGroup(subjectName = '') {
  const normalizedName = normalizeSubjectName(subjectName);
  if (!normalizedName) {
    return null;
  }

  return SUBJECT_GROUPS.find((group) => group.aliases.includes(normalizedName)) ?? null;
}

export function getCanonicalPyqSubject(subject: SubjectMetadataLike) {
  const group = getSubjectGroup(subject.subject ?? '');
  if (group) {
    return {
      name: group.canonicalName,
      slug: group.canonicalSlug
    };
  }

  const fallbackName = subject.subject?.trim() || subject.subject_slug?.replace(/-/g, ' ') || 'PYQ Subject';
  // The name is the source of truth: `&` and `and`, double spaces and dashes
  // all slugify to one URL, so spellings of the same paper land together.
  // `subject_slug` stays as the fallback for papers that carry no name, and
  // the old slug survives as a route alias either way.
  const fallbackSlug = slugifySubjectName(fallbackName) || subject.subject_slug || 'pyq-subject';

  return {
    name: fallbackName,
    slug: fallbackSlug
  };
}

export function getPyqSubjectLookupKeys(subjectName = '') {
  const trimmedName = subjectName.trim();
  if (!trimmedName) {
    return [];
  }

  const keys = new Set<string>();
  const group = getSubjectGroup(trimmedName);

  keys.add(slugifySubjectName(trimmedName));
  keys.add(normalizeSubjectName(trimmedName));

  if (group) {
    keys.add(group.canonicalSlug);
    keys.add(normalizeSubjectName(group.canonicalName));
    group.aliases.forEach((alias) => {
      keys.add(alias);
    });
  }

  return [...keys].filter(Boolean);
}

export function getPyqSubjectRouteAliases(subject: SubjectMetadataLike) {
  const aliases = new Set<string>();
  const canonicalSubject = getCanonicalPyqSubject(subject);

  aliases.add(canonicalSubject.slug);

  if (subject.subject_slug) {
    aliases.add(subject.subject_slug);
  }

  if (subject.subject) {
    aliases.add(slugifySubjectName(subject.subject));
  }

  return [...aliases].filter(Boolean);
}

type PyqPaperMetadataLike = SubjectMetadataLike & {
  year?: number;
  subject_code?: string;
};

type PyqPaperLike = {
  data: { metadata: PyqPaperMetadataLike };
};

export type PyqSubjectRoute<T extends PyqPaperLike> = {
  slug: string;
  papers: T[];
  canonicalSubject: { name: string; slug: string };
};

/**
 * One route per slug, never two.
 *
 * Two subjects can hand out the same slug: an alias from one (`subject_slug`,
 * or a name that slugifies the same) can equal another subject's canonical
 * slug, and the build then drops one page with a route-collision warning.
 * Canonical slugs are reserved first, so a subject always owns its own URL;
 * an alias may only claim a slug nobody owns yet. First in collection order
 * wins, which keeps the output deterministic.
 */
export function groupPyqPapersByRoute<T extends PyqPaperLike>(papers: T[]): PyqSubjectRoute<T>[] {
  const groups = new Map<string, PyqSubjectRoute<T>>();

  for (const paper of papers) {
    const canonicalSubject = getCanonicalPyqSubject(paper.data.metadata);
    const group = groups.get(canonicalSubject.slug) ?? {
      slug: canonicalSubject.slug,
      papers: [],
      canonicalSubject
    };

    group.papers.push(paper);
    groups.set(canonicalSubject.slug, group);
  }

  for (const group of groups.values()) {
    group.papers.sort((a, b) => {
      const byYear = (b.data.metadata.year ?? 0) - (a.data.metadata.year ?? 0);
      if (byYear !== 0) {
        return byYear;
      }

      return String(a.data.metadata.subject_code ?? '').localeCompare(
        String(b.data.metadata.subject_code ?? '')
      );
    });
  }

  const routes = new Map<string, PyqSubjectRoute<T>>(groups);

  for (const group of groups.values()) {
    for (const paper of group.papers) {
      for (const alias of getPyqSubjectRouteAliases(paper.data.metadata)) {
        if (routes.has(alias)) {
          continue;
        }

        routes.set(alias, group);
      }
    }
  }

  return [...routes.entries()].map(([slug, group]) => ({
    slug,
    papers: group.papers,
    canonicalSubject: group.canonicalSubject
  }));
}
