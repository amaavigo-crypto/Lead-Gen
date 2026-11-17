import React from 'react';
import { Lock, ShieldAlert, ArrowLeft } from 'lucide-react';
import { AppUser, ActiveTab } from '../types';

interface LockedModuleViewProps {
  currentUser: AppUser;
  attemptedTab: ActiveTab;
  onNavigateToAllowed: (tab: ActiveTab) => void;
}

export const LockedModuleView: React.FC<LockedModuleViewProps> = ({
  currentUser,
  attemptedTab,
  onNavigateToAllowed,
}) => {
  const firstAllowedTab = (currentUser.allowedModules[0] as ActiveTab) || 'knowledge';

  return (
    <div className="platform-state-shell">
      <div className="platform-state-card platform-state-card--wide">
        <div className="platform-state-icon">
          <Lock className="h-5 w-5" />
        </div>

        <div className="grid max-w-md gap-2">
          <h2>Module Access Restricted</h2>
          <p>
            Your account (<strong>{currentUser.name}</strong>) has been assigned role <strong className="font-mono text-[#155eef]">{currentUser.role}</strong> and does not have permission to access the <strong className="text-[#155eef]">{attemptedTab.toUpperCase()}</strong> module.
          </p>
        </div>

        <div className="platform-state-panel max-w-lg">
          <div className="platform-state-panel-title">
            <ShieldAlert className="h-4 w-4 text-[#155eef]" />
            <span>Assigned Module Permissions in DB:</span>
          </div>
          <div className="platform-state-chips">
            {currentUser.allowedModules.map((mod) => (
              <span key={mod} className="platform-state-chip">
                ✓ {mod}
              </span>
            ))}
          </div>
          <p>
            To grant access to additional modules, update your user document in Firestore database collection <code className="font-mono text-[#263650]">app_users/{currentUser.userId}</code>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateToAllowed(firstAllowedTab)}
          className="platform-state-button"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Return to Allowed Module ({firstAllowedTab})</span>
        </button>
      </div>
    </div>
  );
};
