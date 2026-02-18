/**
 * Inline CSS styles for Gist-compatible HTML output
 * Mobile-first, responsive design
 */

export function getInlineStyles(): string {
  return `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        font-size: 15px;
        line-height: 1.6;
        color: #24292e;
        background: #ffffff;
        padding: 1rem;
        max-width: 1200px;
        margin: 0 auto;
      }

      /* Header */
      .header {
        border-bottom: 2px solid #e1e4e8;
        border-top: 3px solid #6366f1;
        padding-bottom: 1rem;
        padding-top: 1.25rem;
        margin-bottom: 2rem;
      }

      .header h1 {
        font-size: 2rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
      }

      .header .subtitle {
        color: #586069;
        font-size: 0.9rem;
      }

      /* Hero card */
      .hero-card {
        background: linear-gradient(135deg, #f6f8ff 0%, #ffffff 100%);
        border: 1px solid #d0d7de;
        border-left: 4px solid #6366f1;
        border-radius: 8px;
        padding: 1.25rem 1.5rem;
        margin-bottom: 1.5rem;
      }

      .hero-goal {
        font-size: 1.1rem;
        font-weight: 600;
        color: #1f2328;
        line-height: 1.5;
        margin-bottom: 0.75rem;
      }

      .hero-outcome {
        font-size: 0.9rem;
        color: #586069;
        line-height: 1.5;
      }

      .hero-outcome-label {
        display: block;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #8c959f;
        margin-bottom: 0.25rem;
        font-weight: 600;
      }

      .model-badge {
        display: inline-block;
        margin-top: 0.75rem;
        background: #eef0ff;
        color: #4338ca;
        border: 1px solid #c7d2fe;
        border-radius: 999px;
        padding: 0.2em 0.75em;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.75rem;
        font-weight: 500;
      }

      /* Stats Bar */
      .stats-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-bottom: 2rem;
      }

      .stat {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 100px;
        background: #f6f8fa;
        border: 1px solid #d0d7de;
        border-radius: 8px;
        padding: 0.875rem 1rem;
        transition: box-shadow 0.15s ease;
      }

      .stat:hover {
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
      }

      .stat-label {
        font-size: 0.7rem;
        color: #8c959f;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        font-weight: 600;
        margin-bottom: 0.25rem;
      }

      .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: #1f2328;
      }

      /* Timeline (Summary View) */
      .timeline {
        margin: 2rem 0;
      }

      .timeline h2 {
        font-size: 1.5rem;
        margin-bottom: 1rem;
      }

      .moment {
        position: relative;
        padding-left: 2rem;
        padding-bottom: 2rem;
        border-left: 2px solid #e1e4e8;
      }

      .moment:last-child {
        border-left: 2px solid transparent;
        padding-bottom: 0.5rem;
      }

      .moment::before {
        content: '';
        position: absolute;
        left: -7px;
        top: 2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
      }

      .moment.green::before {
        background: #2ea44f;
      }

      .moment.yellow::before {
        background: #fb8500;
      }

      .moment.red::before {
        background: #cf222e;
      }

      .moment-time {
        font-size: 0.7rem;
        color: #8c959f;
        display: block;
        margin-bottom: 0.3rem;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        font-weight: 600;
      }

      .moment-annotation {
        font-weight: 600;
        display: block;
        margin-bottom: 0.4rem;
        font-size: 0.95rem;
        color: #1f2328;
      }

      .moment-link {
        font-size: 0.825rem;
        color: #6366f1;
        text-decoration: none;
      }

      .moment-link:hover {
        text-decoration: underline;
      }

      /* Phases */
      .phases {
        margin: 2rem 0;
      }

      .phase-card {
        background: #f6f8fa;
        border: 1px solid #d0d7de;
        border-left: 3px solid #6366f1;
        border-radius: 6px;
        padding: 0.875rem 1.25rem;
        margin-bottom: 0.75rem;
      }

      .phase-card h3 {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 0.375rem;
        color: #1f2328;
      }

      .phase-card p {
        color: #586069;
        font-size: 0.875rem;
        line-height: 1.5;
      }

      /* Messages */
      .message {
        margin-bottom: 1.5rem;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        overflow: hidden;
      }

      .message.key {
        border-left: 4px solid #2ea44f;
      }

      .message.key.yellow {
        border-left: 4px solid #fb8500;
      }

      .message.key.red {
        border-left: 4px solid #cf222e;
      }

      .message-header {
        background: #f6f8fa;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid #d0d7de;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .message-role {
        font-weight: 600;
        font-size: 0.875rem;
      }

      .message-timestamp {
        font-size: 0.75rem;
        color: #586069;
      }

      .annotation {
        background: #dff6dd;
        border-left: 4px solid #2ea44f;
        padding: 0.75rem 1rem;
        font-size: 0.9rem;
        font-weight: 500;
      }

      .annotation.yellow {
        background: #fff3cd;
        border-left-color: #fb8500;
      }

      .annotation.red {
        background: #ffebe9;
        border-left-color: #cf222e;
      }

      .message-content {
        padding: 1rem;
      }

      /* Collapsible messages */
      details.message summary {
        cursor: pointer;
        padding: 0.75rem 1rem;
        background: #f6f8fa;
        border-bottom: 1px solid #d0d7de;
        list-style: none;
      }

      details.message summary::-webkit-details-marker {
        display: none;
      }

      details.message summary::before {
        content: '▶';
        display: inline-block;
        margin-right: 0.5rem;
        transition: transform 0.2s;
      }

      details.message[open] summary::before {
        transform: rotate(90deg);
      }

      details.message summary:hover {
        background: #eaeef2;
      }

      /* Code blocks */
      pre {
        background: #f6f8fa;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        padding: 1rem;
        overflow-x: auto;
        font-size: 0.875rem;
        line-height: 1.45;
        margin: 1rem 0;
      }

      code {
        font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
        font-size: 0.875em;
        background: #eef0f3;
        color: #1f2328;
        padding: 0.2em 0.4em;
        border-radius: 3px;
      }

      pre code {
        background: transparent;
        padding: 0;
      }

      /* Focus mode toggle */
      .focus-toggle {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: #0969da;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 0.75rem 1.25rem;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 100;
      }

      .focus-toggle:hover {
        background: #0860ca;
      }

      .focus-toggle:active {
        background: #0757ba;
      }

      /* Navigation */
      .nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 0;
        border-top: 1px solid #d0d7de;
        margin-top: 2rem;
      }

      .nav a {
        color: #0969da;
        text-decoration: none;
        font-size: 0.875rem;
        padding: 0.5rem 1rem;
        border: 1px solid #d0d7de;
        border-radius: 6px;
      }

      .nav a:hover {
        background: #f6f8fa;
      }

      /* Keyboard shortcuts helper */
      .keyboard-shortcuts {
        background: #f6f8fa;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        padding: 1rem;
        margin: 1rem 0;
        font-size: 0.875rem;
      }

      .keyboard-shortcuts kbd {
        background: white;
        padding: 0.2rem 0.4rem;
        border: 1px solid #d0d7de;
        border-radius: 3px;
        font-family: monospace;
        font-size: 0.8125rem;
      }

      /* Mobile responsive */
      @media (max-width: 768px) {
        body {
          padding: 0.5rem;
        }

        .header h1 {
          font-size: 1.5rem;
        }

        .stats-bar {
          gap: 0.5rem;
        }

        .stat-value {
          font-size: 1rem;
        }

        .focus-toggle {
          bottom: 1rem;
          right: 1rem;
          padding: 0.5rem 1rem;
          font-size: 0.8125rem;
        }

        .moment {
          padding-left: 1.5rem;
        }

        pre {
          font-size: 0.75rem;
          padding: 0.75rem;
        }

        .keyboard-shortcuts {
          font-size: 0.75rem;
          padding: 0.75rem;
        }

        .keyboard-shortcuts span {
          display: block;
          margin-top: 0.5rem;
        }

        .keyboard-shortcuts kbd {
          font-size: 0.75rem;
          padding: 0.15rem 0.3rem;
        }
      }

      /* Loading state */
      .loading {
        text-align: center;
        padding: 2rem;
        color: #586069;
      }

      /* Empty state */
      .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: #586069;
      }

      .empty-state h2 {
        font-size: 1.25rem;
        margin-bottom: 0.5rem;
        color: #24292e;
      }

      /* Links */
      a {
        color: #0969da;
      }

      a:hover {
        text-decoration: underline;
      }

      /* Utility classes */
      .hidden {
        display: none;
      }

      .text-muted {
        color: #586069;
      }

      .text-center {
        text-align: center;
      }

      .mb-1 { margin-bottom: 0.5rem; }
      .mb-2 { margin-bottom: 1rem; }
      .mb-3 { margin-bottom: 1.5rem; }
      .mb-4 { margin-bottom: 2rem; }

      .mt-1 { margin-top: 0.5rem; }
      .mt-2 { margin-top: 1rem; }
      .mt-3 { margin-top: 1.5rem; }
      .mt-4 { margin-top: 2rem; }
    </style>
  `.trim();
}
