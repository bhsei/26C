"use client";

import { useEffect, useState, useRef } from "react";
import { getUserNotifications, markNotificationAsRead } from "@/app/notifications/actions/notifications-actions";

type Notification = {
  id: string;
  message: string;
  createdAt: Date;
  isRead: boolean;
};

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  
  // Referência para detectar cliques fora da janela de notificação
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getUserNotifications().then(setNotifications);
  }, []);

  // Efeito para fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Se a janela está aberta, e o clique ocorreu fora do container, fecha a janela
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (id: string) => {
    await markNotificationAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const displayedNotifications = showAll ? notifications : notifications.slice(0, 3);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    // Adicionamos o ref ao container principal
    <div className="relative" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 bg-transparent rounded-full hover:bg-gray-100 transition-colors duration-200"
        aria-label="Notifications"
      >
        <span className="text-xl leading-none">🔔</span>
        {/* Mantivemos a bolinha vermelha no sino, pois é um padrão universal de alerta */}
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full border-2 border-white transform translate-x-1/4 -translate-y-1/4">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 flex flex-col">
          {/* Cabeçalho */}
          <div className="px-4 py-3 bg-white border-b border-gray-100 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Notifications
            </span>
            {unreadCount > 0 && (
              // Badge azul para destacar as notificações novas
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          
          {/* Lista de Notificações */}
          <div className="max-h-[22rem] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-sm text-gray-400 text-center">
                You&apos;re all caught up!
              </div>
            ) : (
              displayedNotifications.map((notif) => (
                <div 
                  key={notif.id} 
                  className={`border-b border-gray-100 flex justify-between items-start gap-3 transition-colors ${
                    // A borda esquerda azul (border-l-blue-600) e ajuste de padding (pl-3 vs pl-4) fazem o destaque
                    notif.isRead 
                      ? "bg-gray-50/60 p-4" 
                      : "bg-white border-l-4 border-l-blue-600 py-4 pr-4 pl-3"
                  }`}
                >
                  <div className="flex-1">
                    <p className={`text-sm leading-snug ${
                      notif.isRead 
                        ? "text-gray-400 font-normal" 
                        : "text-gray-900 font-bold"
                    }`}>
                      {notif.message}
                    </p>
                    <span className={`text-[11px] mt-1.5 block ${notif.isRead ? "text-gray-400" : "text-blue-500/80 font-medium"}`}>
                      {formatDate(notif.createdAt)}
                    </span>
                  </div>
                  
                  {!notif.isRead && (
                    <button 
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="text-gray-300 hover:text-blue-600 transition-colors mt-0.5"
                      title="Mark as read"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Rodapé */}
          {notifications.length > 3 && (
            <div className="p-2 bg-white border-t border-gray-100">
              <button
                onClick={() => setShowAll(!showAll)}
                // Botão de texto azul com hover suave
                className="w-full py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 rounded-lg transition-colors"
              >
                {showAll ? "Show less" : `View all past notifications`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}