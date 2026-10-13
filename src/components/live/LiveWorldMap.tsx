"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { EVENT_CONFIG, type FunnelEvent } from "./worldData";

interface LiveWorldMapProps {
  events: FunnelEvent[];
  mapboxToken?: string;
  mapboxStyle?: string;
  focusPoint?: { lat: number; lng: number; id: string } | null;
}

const CONTINENTS: [number, number][][] = [
  // América del Norte
  [[-168, 65], [-140, 70], [-120, 76], [-80, 72], [-60, 50], [-70, 42], [-80, 25], [-97, 18], [-105, 23], [-117, 32], [-124, 48], [-140, 60], [-168, 65]],
  // América del Sur
  [[-78, 10], [-60, 8], [-35, -5], [-38, -13], [-53, -33], [-65, -54], [-75, -45], [-70, -18], [-80, -2], [-78, 10]],
  // Europa
  [[-9, 36], [2, 42], [14, 38], [26, 40], [30, 47], [32, 60], [20, 65], [5, 60], [5, 50], [-4, 48], [-9, 36]],
  // África
  [[-17, 14], [-5, 36], [12, 37], [32, 31], [43, 12], [51, 10], [40, -10], [32, -28], [18, -34], [12, -18], [9, 4], [-17, 14]],
  // Asia
  [[32, 31], [40, 45], [50, 60], [80, 72], [120, 70], [140, 55], [130, 35], [105, 20], [80, 12], [68, 25], [50, 25], [32, 31]],
  // Oceanía / Australia
  [[114, -22], [130, -12], [145, -15], [153, -28], [148, -38], [135, -35], [115, -34], [114, -22]],
  // Antártida
  [[-180, -78], [-120, -75], [-60, -70], [0, -68], [60, -70], [120, -72], [180, -78], [180, -89], [-180, -89], [-180, -78]]
];

export function LiveWorldMap({ events, mapboxToken, mapboxStyle, focusPoint }: LiveWorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [useCanvas, setUseCanvas] = useState(!mapboxToken);

  const totalPoints = useMemo(() => events.length, [events]);

  const validEvents = useMemo(() => {
    return events.filter((e) => typeof e.latitude === "number" && typeof e.longitude === "number");
  }, [events]);

  useEffect(() => {
    if (!mapboxToken || !containerRef.current) {
      setUseCanvas(true);
      return;
    }

    let isMounted = true;
    try {
      mapboxgl.accessToken = mapboxToken;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: mapboxStyle || "mapbox://styles/mapbox/light-v11",
        center: [0, 20],
        zoom: 1.3,
        projection: "globe",
        attributionControl: false,
        interactive: true,
      });

      map.on("error", () => {
        if (isMounted) setUseCanvas(true);
      });

      map.on("style.load", () => {
        if (!isMounted) return;
        map.setFog({
          color: "rgb(250, 248, 245)",
          "high-color": "rgb(230, 238, 250)",
          "horizon-blend": 0.08,
          "space-color": "rgb(245, 243, 240)",
          "star-intensity": 0.0,
        });
      });

      mapRef.current = map;

      return () => {
        isMounted = false;
        map.remove();
        mapRef.current = null;
      };
    } catch {
      setUseCanvas(true);
    }
  }, [mapboxToken, mapboxStyle]);

  useEffect(() => {
    if (!useCanvas || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let rotation = -60;
    let targetRotation = rotation;
    let isDragging = false;
    let startX = 0;
    let pulseTime = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    if (focusPoint) {
      targetRotation = -focusPoint.lng;
    }

    const toXY = (lat: number, lng: number, cx: number, cy: number, radius: number) => {
      const lambda = ((lng + rotation) * Math.PI) / 180;
      const phi = (lat * Math.PI) / 180;
      const cosPhi = Math.cos(phi);
      const cosLambda = Math.cos(lambda);

      const visible = cosPhi * cosLambda > 0;
      const x = cx + radius * cosPhi * Math.sin(lambda);
      const y = cy - radius * Math.sin(phi);

      return { x, y, visible };
    };

    const render = () => {
      pulseTime += 0.03;

      if (!isDragging) {
        if (focusPoint) {
          rotation += (targetRotation - rotation) * 0.05;
        } else {
          rotation += 0.15;
        }
      }

      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const radius = Math.min(cx, cy) * 0.78;

      ctx.clearRect(0, 0, rect.width, rect.height);

      // Atmósfera
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, radius * 1.18);
      halo.addColorStop(0, "rgba(0, 158, 227, 0.15)");
      halo.addColorStop(1, "rgba(0, 158, 227, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.18, 0, Math.PI * 2);
      ctx.fill();

      // Océano (Modo Claro)
      const oceanGrad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
      oceanGrad.addColorStop(0, "#F0F9FF");
      oceanGrad.addColorStop(0.8, "#E0F2FE");
      oceanGrad.addColorStop(1, "#BAE6FD");
      ctx.fillStyle = oceanGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Sombra 3D
      const innerShadow = ctx.createRadialGradient(cx - radius * 0.4, cy - radius * 0.4, radius * 0.2, cx, cy, radius);
      innerShadow.addColorStop(0, "rgba(255, 255, 255, 0.6)");
      innerShadow.addColorStop(0.7, "rgba(0, 0, 0, 0)");
      innerShadow.addColorStop(1, "rgba(15, 23, 42, 0.12)");
      ctx.fillStyle = innerShadow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Continentes
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.strokeStyle = "rgba(2, 132, 199, 0.12)";
      ctx.lineWidth = 1;

      [-30, 0, 30].forEach((lat) => {
        ctx.beginPath();
        let started = false;
        for (let lng = -180; lng <= 180; lng += 10) {
          const pt = toXY(lat, lng, cx, cy, radius);
          if (pt.visible) {
            if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
            else { ctx.lineTo(pt.x, pt.y); }
          } else {
            started = false;
          }
        }
        ctx.stroke();
      });

      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#CBD5E1";
      ctx.lineWidth = 1.2;

      CONTINENTS.forEach((poly) => {
        ctx.beginPath();
        let started = false;
        let anyVisible = false;

        poly.forEach(([lng, lat]) => {
          const pt = toXY(lat, lng, cx, cy, radius);
          if (pt.visible) {
            anyVisible = true;
            if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
            else { ctx.lineTo(pt.x, pt.y); }
          }
        });

        if (anyVisible) {
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      });

      // Puntos de Visitantes
      validEvents.forEach((ev) => {
        const pt = toXY(ev.latitude!, ev.longitude!, cx, cy, radius);
        if (!pt.visible) return;

        const isFocused = focusPoint && focusPoint.id === ev.metadata?.ip_detected;
        const color = EVENT_CONFIG[ev.event_type]?.color || "#009EE3";

        const pSize = 5 + Math.sin(pulseTime * 2 + ev.latitude!) * 3;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isFocused ? pSize * 2 : pSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isFocused ? 7 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (isFocused && ev.city) {
          ctx.fillStyle = "#0F172A";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`📍 ${ev.city}`, pt.x, pt.y - 12);
        }
      });

      ctx.restore();

      ctx.strokeStyle = "rgba(186, 230, 253, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      rotation += dx * 0.4;
      startX = e.clientX;
    };
    const onMouseUp = () => { isDragging = false; };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [useCanvas, validEvents, focusPoint]);

  return (
    <div className="relative w-full rounded border border-border bg-card overflow-hidden shadow-sm" style={{ minHeight: 340, maxHeight: 440 }}>
      {useCanvas ? (
        <canvas ref={canvasRef} className="w-full h-[340px] sm:h-[390px] lg:h-[430px] cursor-grab active:cursor-grabbing" />
      ) : (
        <div ref={containerRef} className="w-full h-[340px] sm:h-[390px] lg:h-[430px]" />
      )}

      <div className="absolute top-3.5 left-3.5 z-[2] flex items-center gap-2 bg-background/90 backdrop-blur-md border border-border/80 rounded-full px-3 py-1 shadow-sm">
        <div className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
        </div>
        <span className="text-[10px] font-black text-foreground uppercase tracking-widest">Globo 3D En Vivo</span>
      </div>

      <div className="absolute top-3.5 right-3.5 z-[2] bg-background/90 backdrop-blur-md border border-border/80 rounded-full px-3 py-1 shadow-sm">
        <span className="text-[11px] font-bold text-foreground">
          {totalPoints} <span className="text-muted-foreground font-normal">visitantes geolocalizados</span>
        </span>
      </div>
    </div>
  );
}
