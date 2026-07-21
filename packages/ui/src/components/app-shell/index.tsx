import { Bell, CircleHelp, Search, UserRound } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';

export interface NavigationItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export interface WorkspaceTab {
  id: string;
  label: string;
  dirty?: boolean;
  stale?: boolean;
}

export interface AppShellProps {
  brand: string;
  tenant: string;
  navigation: NavigationGroup[];
  activeNavigationId: string;
  tabs: WorkspaceTab[];
  activeTabId: string;
  children: ReactNode;
  onSearch?: (query: string) => void;
  onNavigate?: (id: string) => void;
  onTabChange?: (id: string) => void;
}

export function AppShell({
  activeNavigationId,
  activeTabId,
  brand,
  children,
  navigation,
  onNavigate,
  onSearch,
  onTabChange,
  tabs,
  tenant,
}: AppShellProps) {
  const [query, setQuery] = useState('');
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    onSearch?.(query.trim());
  };

  return (
    <div className="zl-shell">
      <header className="zl-shell__topbar">
        <div className="zl-shell__brand" title={brand}>
          <span className="zl-shell__brand-mark" aria-hidden="true">
            智
          </span>
          <span>{brand}</span>
        </div>
        <button className="zl-shell__tenant" type="button">
          {tenant}
        </button>
        <form className="zl-shell__search" role="search" onSubmit={submitSearch}>
          <Search aria-hidden="true" size={16} />
          <input
            type="search"
            aria-label="全局搜索"
            value={query}
            placeholder="搜索运单、客户、账单…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <div className="zl-shell__utilities">
          <button type="button" className="zl-icon-button" aria-label="消息">
            <Bell aria-hidden="true" size={17} />
          </button>
          <button type="button" className="zl-icon-button" aria-label="帮助">
            <CircleHelp aria-hidden="true" size={17} />
          </button>
          <button type="button" className="zl-shell__user" aria-label="用户菜单">
            <UserRound aria-hidden="true" size={17} />
          </button>
        </div>
      </header>
      <aside className="zl-shell__sidebar">
        <nav aria-label="业务导航">
          {navigation.map((group) => (
            <section key={group.label} className="zl-shell__nav-group">
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-active={item.id === activeNavigationId || undefined}
                  onClick={() => onNavigate?.(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>
      </aside>
      <div className="zl-shell__tabs" role="tablist" aria-label="工作页签">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === activeTabId}
            data-active={tab.id === activeTabId || undefined}
            onClick={() => onTabChange?.(tab.id)}
          >
            {tab.label}
            {tab.dirty ? <span className="zl-shell__tab-dot" aria-label="有未保存修改" /> : null}
            {tab.stale ? <span className="zl-shell__tab-stale">已过期</span> : null}
          </button>
        ))}
      </div>
      <main className="zl-shell__workspace">{children}</main>
    </div>
  );
}
