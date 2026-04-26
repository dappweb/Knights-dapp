import React, { useState, useEffect } from 'react';
import { Settings, Bell, BellOff } from 'lucide-react';
import { enableErrorNotifications, disableErrorNotifications, toastConfig } from '../utils/toastConfig';

const NotificationSettings: React.FC = () => {
  const [errorNotificationsEnabled, setErrorNotificationsEnabled] = useState(false);

  useEffect(() => {
    // Get current state
    setErrorNotificationsEnabled(toastConfig.areErrorNotificationsEnabled());
  }, []);

  const handleToggleErrorNotifications = () => {
    const newState = !errorNotificationsEnabled;
    setErrorNotificationsEnabled(newState);
    
    if (newState) {
      enableErrorNotifications();
      toastConfig.success('绾㈣壊閿欒鎻愰啋宸插惎鐢?);
    } else {
      disableErrorNotifications();
      toastConfig.success('绾㈣壊閿欒鎻愰啋宸茬鐢?);
    }
  };

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <Settings className="text-blue-400" size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">閫氱煡璁剧疆</h3>
          <p className="text-sm text-gray-400">绠＄悊搴旂敤閫氱煡鍋忓ソ</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            {errorNotificationsEnabled ? (
              <Bell className="text-red-400" size={20} />
            ) : (
              <BellOff className="text-gray-400" size={20} />
            )}
            <div>
              <p className="text-white font-medium">閿欒鎻愰啋閫氱煡</p>
              <p className="text-xs text-gray-400">
                {errorNotificationsEnabled ? '鏄剧ず绾㈣壊閿欒寮圭獥鎻愰啋' : '闅愯棌绾㈣壊閿欒寮圭獥鎻愰啋'}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleToggleErrorNotifications}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
              errorNotificationsEnabled ? 'bg-red-500' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                errorNotificationsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="text-xs text-gray-500 bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
          <p className="mb-2">
            <strong className="text-gray-400">璇存槑锛?/strong>
          </p>
          <ul className="space-y-1 list-disc list-inside">
            <li>鎴愬姛鎻愰啋锛堢豢鑹诧級濮嬬粓鏄剧ず</li>
            <li>鍔犺浇鎻愰啋锛堣摑鑹诧級濮嬬粓鏄剧ず</li>
            <li>閿欒淇℃伅浠嶄細鍦ㄦ帶鍒跺彴涓褰?/li>
            <li>鍏抽敭閿欒浠嶄細閫氳繃鍏朵粬鏂瑰紡鎻愮ず</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;