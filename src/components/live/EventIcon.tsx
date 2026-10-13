"use client";

import {
  Eye, Dices, UserPlus, ShoppingCart, FileText, CheckCircle, PartyPopper,
  LogOut, Ban, AlertTriangle, XCircle, Zap, ExternalLink, Wallet,
  CreditCard, Globe, IdCard, Building, Lock, Smartphone, AlertCircle,
  LayoutDashboard, Gem, FileCheck, BarChart, Handshake, Rocket, Bot,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Eye, Dices, UserPlus, ShoppingCart, FileText, CheckCircle, PartyPopper,
  LogOut, Ban, AlertTriangle, XCircle, Zap, ExternalLink, Wallet,
  CreditCard, Globe, IdCard, Building, Lock, Smartphone, AlertCircle,
  LayoutDashboard, Gem, FileCheck, BarChart, Handshake, Rocket, Bot,
};

interface EventIconProps {
  name: string;
  className?: string;
}

export function EventIcon({ name, className = "w-3.5 h-3.5" }: EventIconProps) {
  const IconComponent = ICON_MAP[name];
  if (!IconComponent) return <span className={className}>•</span>;
  return <IconComponent className={className} />;
}
