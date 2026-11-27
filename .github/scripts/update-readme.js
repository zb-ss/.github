// Regenerates the project list between the REPOS markers in profile/README.md
// from the organization's public repositories. Section titles, the topics that
// place a repository in a section, and repositories to leave out are set in
// .github/readme-sections.json, so changing the layout needs no code change.
'use strict';

const fs = require('fs');

const START_MARKER = '<!-- REPOS:START -->';
const END_MARKER = '<!-- REPOS:END -->';

function escapeCell(text) {
  return String(text || '').replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ').trim();
}

function isListed(repo, config) {
  const hidden = [...config.featured_repos, ...config.ignored_repos];
  return !repo.fork && !repo.archived && !repo.private && !hidden.includes(repo.name);
}

// The first section (in config order) sharing a topic with the repo wins.
function sectionTitleFor(repo, config) {
  const topics = repo.topics || [];
  const section = config.sections.find((candidate) =>
    candidate.topics.some((topic) => topics.includes(topic)));
  return section ? section.title : config.fallback_title;
}

function byStarsThenRecent(a, b) {
  return (b.stargazers_count - a.stargazers_count)
    || (Date.parse(b.pushed_at) - Date.parse(a.pushed_at));
}

function renderRow(repo) {
  const stars = repo.stargazers_count > 0 ? String(repo.stargazers_count) : '';
  return `| [${repo.name}](${repo.html_url}) | ${escapeCell(repo.description)} `
    + `| ${escapeCell(repo.language)} | ${stars} |`;
}

function renderSections(repos, config) {
  const titles = [...config.sections.map((section) => section.title), config.fallback_title];
  const grouped = new Map(titles.map((title) => [title, []]));

  repos
    .filter((repo) => isListed(repo, config))
    .sort(byStarsThenRecent)
    .forEach((repo) => grouped.get(sectionTitleFor(repo, config)).push(repo));

  let output = '';
  for (const [title, items] of grouped) {
    if (items.length === 0) continue;
    output += `### ${title}\n\n`;
    output += '| Project | Description | Language | ★ |\n|---|---|---|--:|\n';
    output += `${items.map(renderRow).join('\n')}\n\n`;
  }
  return output;
}

function replaceBlock(readme, block) {
  const pattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`);
  if (!pattern.test(readme)) {
    throw new Error(`README is missing the ${START_MARKER} ... ${END_MARKER} markers`);
  }
  // A replacer function keeps "$" in repo descriptions from acting as a pattern.
  return readme.replace(pattern, () => `${START_MARKER}\n${block}${END_MARKER}`);
}

async function updateReadme({ github, org, readmePath, configPath }) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const repos = await github.paginate(github.rest.repos.listForOrg, {
    org,
    type: 'public',
    per_page: 100,
  });
  const readme = fs.readFileSync(readmePath, 'utf8');
  fs.writeFileSync(readmePath, replaceBlock(readme, renderSections(repos, config)));
}

module.exports = updateReadme;
module.exports.renderSections = renderSections;
module.exports.replaceBlock = replaceBlock;
