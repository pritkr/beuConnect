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
  const fallbackSlug = subject.subject_slug || slugifySubjectName(fallbackName);

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
