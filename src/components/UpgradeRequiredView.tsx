import React from 'react';
import { Lock } from 'lucide-react';

export const UpgradeRequiredView: React.FC<{ featureLabel: string; planName?: string; isAdmin: boolean; onBack: () => void }> = ({
  featureLabel,
  planName,
  isAdmin,
  onBack,
}) => (
  <div className="platform-state-shell">
    <div className="platform-state-card">
      <div className="platform-state-icon">
        <Lock className="h-5 w-5" />
      </div>
      <h2>{featureLabel} isn't included in your plan</h2>
      <p>
        {planName ? `Your workspace is on the ${planName} plan. ` : ''}
        {isAdmin ? 'Upgrade your plan to unlock this feature.' : 'Ask your workspace admin to upgrade the plan to unlock this feature.'}
      </p>
      <button type="button" onClick={onBack} className="platform-state-button platform-state-button--secondary">
        Back to inbox
      </button>
    </div>
  </div>
);
