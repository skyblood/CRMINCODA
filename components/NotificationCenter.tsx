
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Lead, Project } from '../types';
import { Bell, Calendar, CheckSquare, AlertCircle, Clock, ShieldAlert } from 'lucide-react';
import { loadNotifSettings, NOTIF_SETTINGS_EVENT } from './NotificationSettings';

interface NotificationCenterProps {
  leads: Lead[];
  projects: Project[];
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ leads, projects }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifSettings, setNotifSettings] = useState(loadNotifSettings);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reload settings when admin changes them (same or other tab)
  useEffect(() => {
    const reload = () => setNotifSettings(loadNotifSettings());
    window.addEventListener('storage', reload);
    window.addEventListener(NOTIF_SETTINGS_EVENT, reload);
    return () => {
      window.removeEventListener('storage', reload);
      window.removeEventListener(NOTIF_SETTINGS_EVENT, reload);
    };
  }, []);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const taskAlerts = useMemo(() => {
    if (!notifSettings.taskAlerts) return [];
    const alerts: {
      id: string;
      title: string;
      context: string;
      dueDate: string;
      isOverdue: boolean;
      type: 'task';
    }[] = [];

    leads.forEach(lead => {
      if (!lead.tasks) return;
      (lead.tasks || []).forEach(task => {
        if (task.status !== 'done' && task.dueDate && task.dueDate <= todayStr) {
          alerts.push({
            id: task.id,
            title: task.title,
            context: lead.companyName,
            dueDate: task.dueDate,
            isOverdue: task.dueDate < todayStr,
            type: 'task'
          });
        }
      });
    });

    return alerts.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return 0;
    });
  }, [leads, todayStr]);

  const contractAlerts = useMemo(() => {
    if (!notifSettings.contractAlerts) return [];
    const alerts: {
      id: string;
      projectName: string;
      clientName: string;
      contractEndDate: string;
      daysLeft: number;
      isExpired: boolean;
      isCritical: boolean; // ≤ 7 days
    }[] = [];

    projects.forEach(p => {
      if (p.type !== 'support' || !p.contractEndDate || p.status === 'completed') return;
      const end = new Date(p.contractEndDate);
      const diffMs = end.getTime() - today.getTime();
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysLeft <= 30) {
        alerts.push({
          id: p.id,
          projectName: p.name,
          clientName: p.clientName,
          contractEndDate: p.contractEndDate,
          daysLeft,
          isExpired: daysLeft < 0,
          isCritical: daysLeft >= 0 && daysLeft <= 7
        });
      }
    });

    return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [projects, today]);

  const totalCount = taskAlerts.length + contractAlerts.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
      >
        <Bell size={20} />
        {totalCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
          <div className="p-3 border-b border-gray-100 bg-gray-50 rounded-t-xl flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-800">Notifications</h3>
            <span className="text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-500">
              {totalCount} Pending
            </span>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {totalCount > 0 ? (
              <div className="divide-y divide-gray-50">

                {/* Contract Expiration Alerts */}
                {contractAlerts.map(alert => (
                  <div key={`contract-${alert.id}`} className={`p-3 transition-colors group ${alert.isExpired ? 'bg-red-50 hover:bg-red-100' : alert.isCritical ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${alert.isExpired ? 'text-red-600' : alert.isCritical ? 'text-orange-500' : 'text-yellow-500'}`}>
                        <ShieldAlert size={16} />
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${alert.isExpired ? 'text-red-800' : 'text-gray-800'}`}>
                          {alert.isExpired ? '⚠️ Contract Expired' : alert.isCritical ? '🔴 Contract Expiring Soon' : '🟡 Contract Expiring'}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5 font-medium">{alert.projectName}</p>
                        <p className="text-xs text-gray-500">{alert.clientName}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-[10px] flex items-center gap-1 font-medium px-1.5 py-0.5 rounded ${
                            alert.isExpired
                              ? 'text-red-700 bg-red-100'
                              : alert.isCritical
                              ? 'text-orange-700 bg-orange-100'
                              : 'text-yellow-700 bg-yellow-100'
                          }`}>
                            <Calendar size={10} />
                            {alert.isExpired
                              ? `Expired ${Math.abs(alert.daysLeft)}d ago`
                              : alert.daysLeft === 0
                              ? 'Expires today'
                              : `${alert.daysLeft} days left`}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(alert.contractEndDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Task Due Alerts */}
                {taskAlerts.map(note => (
                  <div key={note.id} className="p-3 hover:bg-gray-50 transition-colors group">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${note.isOverdue ? 'text-red-500' : 'text-orange-500'}`}>
                        {note.isOverdue ? <AlertCircle size={16} /> : <Clock size={16} />}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${note.isOverdue ? 'text-red-700' : 'text-gray-800'}`}>
                          {note.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <CheckSquare size={10} /> {note.context}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-[10px] flex items-center gap-1 font-medium ${note.isOverdue ? 'text-red-600 bg-red-50 px-1.5 py-0.5 rounded' : 'text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded'}`}>
                            <Calendar size={10} />
                            {note.isOverdue ? 'Overdue: ' : 'Due Today: '}
                            {new Date(note.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

              </div>
            ) : (
              <div className="p-8 text-center text-gray-400">
                <Bell size={24} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">You're all caught up!</p>
                <p className="text-xs mt-1">No alerts at this time.</p>
              </div>
            )}
          </div>

          {totalCount > 0 && (
            <div className="p-2 border-t border-gray-100 bg-gray-50 rounded-b-xl text-center">
              <p className="text-[10px] text-gray-400">Contract alerts show 30 days before expiration.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
