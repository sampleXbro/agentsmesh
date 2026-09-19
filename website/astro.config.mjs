// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import devOnlyRoutes from './integrations/dev-only-routes.mjs';
import llmsTxtIntegration from './integrations/llms-txt.mjs';
import seoRobotsIntegration from './integrations/seo-robots.mjs';
import {
  absoluteFromBase,
  fromBase,
  getSiteBase,
  getSiteOrigin,
  resolveDeploySite,
} from './site-url.mjs';

const deploySite = resolveDeploySite();
const site = getSiteOrigin();
const ogImage = absoluteFromBase('/og-image.png');
const docsRoot = absoluteFromBase('/');

const websiteJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'AgentsMesh',
  alternateName: 'AgentsMesh — AI Coding Config Sync',
  url: docsRoot,
  description:
    'Open-source AI coding config sync CLI and TypeScript library. One canonical .agentsmesh directory generates native configs for every major AI coding tool — and gives agents a shared lessons memory that learns from failures in your repo.',
  inLanguage: 'en-US',
  publisher: {
    '@type': 'Organization',
    name: 'AgentsMesh',
    url: docsRoot,
    logo: {
      '@type': 'ImageObject',
      url: ogImage,
    },
  },
});

const organizationJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AgentsMesh',
  url: docsRoot,
  logo: ogImage,
  sameAs: ['https://github.com/sampleXbro/agentsmesh', 'https://www.npmjs.com/package/agentsmesh'],
});

export default defineConfig({
  site,
  trailingSlash: 'always',
  base: getSiteBase(),
  integrations: [
    starlight({
      plugins: [starlightLinksValidator({ errorOnRelativeLinks: false })],
      title: 'AgentsMesh CLI',
      tagline: 'One config for every AI coding tool. Agents that learn.',
      components: {
        Head: './src/components/Head.astro',
        Hero: './src/components/home/Hero.astro',
      },
      expressiveCode: {
        styleOverrides: {
          borderRadius: '0.625rem',
          borderColor: 'var(--sl-color-gray-5)',
          frames: { shadowColor: 'transparent' },
        },
      },
      description:
        'AgentsMesh is an open-source CLI and TypeScript library that syncs AI coding agent config (rules, commands, agents, skills, MCP servers, hooks, permissions) from one .agentsmesh source to Claude Code, Cursor, GitHub Copilot, Gemini CLI, Codex CLI and every other tool, with a lessons memory that learns from your repo.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: true,
      },
      social: {
        github: 'https://github.com/sampleXbro/agentsmesh',
      },
      editLink: {
        baseUrl: 'https://github.com/sampleXbro/agentsmesh/edit/master/website/',
      },
      customCss: [
        '@fontsource-variable/bricolage-grotesque',
        '@fontsource/ibm-plex-sans/400.css',
        '@fontsource/ibm-plex-sans/500.css',
        '@fontsource/ibm-plex-sans/600.css',
        '@fontsource/ibm-plex-mono/400.css',
        '@fontsource/ibm-plex-mono/500.css',
        './src/styles/tokens.css',
        './src/styles/docs-chrome.css',
        './src/styles/docs-content.css',
      ],
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: ogImage },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: ogImage },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:site', content: '@agentsmesh' },
        },
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#0c0e12' },
        },
        {
          tag: 'link',
          attrs: { rel: 'icon', href: fromBase('/favicon.svg'), type: 'image/svg+xml' },
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: websiteJsonLd,
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: organizationJsonLd,
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
          ],
        },
        {
          label: 'Canonical Configuration',
          items: [
            { label: 'Overview', slug: 'canonical-config' },
            { label: 'Rules', slug: 'canonical-config/rules' },
            { label: 'Commands', slug: 'canonical-config/commands' },
            { label: 'Agents', slug: 'canonical-config/agents' },
            { label: 'Skills', slug: 'canonical-config/skills' },
            { label: 'MCP Servers', slug: 'canonical-config/mcp-servers' },
            { label: 'Hooks', slug: 'canonical-config/hooks' },
            { label: 'Ignore Patterns', slug: 'canonical-config/ignore-patterns' },
            { label: 'Permissions', slug: 'canonical-config/permissions' },
          ],
        },
        {
          label: 'CLI Reference',
          items: [
            { label: 'Overview', slug: 'cli' },
            { label: 'init', slug: 'cli/init' },
            { label: 'generate', slug: 'cli/generate' },
            { label: 'import', slug: 'cli/import' },
            { label: 'lessons', slug: 'cli/lessons' },
            { label: 'convert', slug: 'cli/convert' },
            { label: 'install', slug: 'cli/install' },
            { label: 'installs', slug: 'cli/installs' },
            { label: 'uninstall', slug: 'cli/uninstall' },
            { label: 'refresh', slug: 'cli/refresh' },
            { label: 'diff', slug: 'cli/diff' },
            { label: 'lint', slug: 'cli/lint' },
            { label: 'watch', slug: 'cli/watch' },
            { label: 'check', slug: 'cli/check' },
            { label: 'merge', slug: 'cli/merge' },
            { label: 'matrix', slug: 'cli/matrix' },
            { label: 'plugin', slug: 'cli/plugin' },
            { label: 'target', slug: 'cli/target' },
            { label: 'mcp', slug: 'cli/mcp' },
          ],
        },
        {
          label: 'Configuration',
          items: [
            { label: 'agentsmesh.yaml', slug: 'configuration/agentsmesh-yaml' },
            { label: 'Local Overrides', slug: 'configuration/local-overrides' },
            { label: 'Extends', slug: 'configuration/extends' },
            { label: 'Collaboration', slug: 'configuration/collaboration' },
            { label: 'Conversions', slug: 'configuration/conversions' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'CLAUDE.md vs AGENTS.md', slug: 'guides/claude-md-vs-agents-md' },
            { label: 'Adopting AgentsMesh', slug: 'guides/existing-project' },
            { label: 'Teach Your Agents (Lessons)', slug: 'guides/lessons' },
            { label: 'Multi-Tool Teams', slug: 'guides/multi-tool-teams' },
            { label: 'One mcp.json for Every Tool', slug: 'guides/one-mcp-json' },
            { label: 'Sharing Config Across Repos', slug: 'guides/sharing-config' },
            { label: 'CI Drift Detection', slug: 'guides/ci-drift-detection' },
            { label: 'Community Packs', slug: 'guides/community-packs' },
            { label: 'Installing Skill Packs', slug: 'guides/installing-skill-packs' },
            { label: 'Building Plugins', slug: 'guides/building-plugins' },
            { label: 'Extending AgentsMesh', slug: 'guides/extending' },
            { label: 'Local Dev Overrides', slug: 'guides/local-overrides' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Supported Tools Matrix', slug: 'reference/supported-tools' },
            { label: 'Alternatives (vs Ruler / rulesync)', slug: 'reference/alternatives' },
            { label: 'Lessons Graph', slug: 'reference/lessons' },
            { label: 'Generation Pipeline', slug: 'reference/generation-pipeline' },
            { label: 'Managed Embedding', slug: 'reference/managed-embedding' },
            { label: 'Programmatic API', slug: 'reference/programmatic-api' },
            { label: 'MCP Server', slug: 'reference/mcp-server' },
            { label: 'JSON Schemas', slug: 'reference/json-schemas' },
          ],
        },
      ],
    }),
    seoRobotsIntegration(() => deploySite.publicUrl),
    devOnlyRoutes([
      { pattern: '/og', entrypoint: './src/dev-pages/og.astro' },
      { pattern: '/og-github', entrypoint: './src/dev-pages/og-github.astro' },
    ]),
    llmsTxtIntegration({
      siteName: 'AgentsMesh CLI',
      description:
        'One config for every AI coding tool, with a shared lessons memory that learns from your repo.',
      getSiteUrl: () => docsRoot,
    }),
  ],
});
