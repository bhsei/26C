"use server";

import prisma from "@/lib/prisma"; 
import { getCurrentUser } from "@/lib/auth"; 

export async function getUserNotifications() {
  const user = await getCurrentUser();
  
  if (!user) {
    return [];
  }

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc", 
    },
    select: {
      id: true,
      message: true,
      createdAt: true,
      isRead: true,
    },
  });

  return notifications;
}

export async function markNotificationAsRead(id: string) {
  try {
    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    return { success: false };
  }
}