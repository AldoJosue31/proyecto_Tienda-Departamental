"use client";
import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map, Polyline } from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { PickPackTracking, CourierRoute } from "@/lib/logistics/pick-pack-types";

function decoded(value:string):Array<[number,number]> {
  const points:Array<[number,number]>=[];let offset=0,lat=0,lng=0;
  const next=()=>{let result=0,shift=0,byte=0;do{if(offset>=value.length || shift>30)throw new Error("Invalid polyline");byte=value.charCodeAt(offset++)-63;result|=(byte&31)<<shift;shift+=5;}while(byte>=32);return result&1 ? ~(result>>1) : result>>1;};
  if(value.length>100000)return points;
  try{while(offset<value.length && points.length<20000){lat+=next();lng+=next();points.push([lat/100000,lng/100000]);}}catch{return [];}
  return points;
}
export function OpenstreetCourierMap({tracking,route}:{tracking:PickPackTracking;route:CourierRoute|undefined}) {
  const element=useRef<HTMLDivElement>(null),map=useRef<Map|null>(null),marker=useRef<CircleMarker|null>(null),destination=useRef<CircleMarker|null>(null),line=useRef<Polyline|null>(null);
  const latest=useRef({tracking,route});const [failure,setFailure]=useState(false),[ready,setReady]=useState(false);
  const framed=useRef(false);
  const hasLocation=Boolean(tracking.location);
  useEffect(()=>{latest.current={tracking,route};if(!ready || !map.current || !tracking.location)return;
    const point:[number,number]=[tracking.location.latitude,tracking.location.longitude];marker.current?.setLatLng(point);
    if(route?.destination){const target:[number,number]=[route.destination.latitude,route.destination.longitude];destination.current?.setLatLng(target).addTo(map.current);if(!framed.current){map.current.fitBounds([point,target],{padding:[25,25],maxZoom:16});framed.current=true;}}
    const path=route?.encodedPolyline ? decoded(route.encodedPolyline) : tracking.location.source==="DEMO" && route?.destination ? [point,[route.destination.latitude,route.destination.longitude] as [number,number]] : [];
    line.current?.setLatLngs(path);
  },[tracking,route,ready]);
  useEffect(()=>{if(!element.current)return;let disposed=false;
    void import("leaflet").then(L=>{
      if(disposed || !element.current)return;const location=latest.current.tracking.location;if(!location)return;
      const point:[number,number]=[location.latitude,location.longitude];const instance=L.map(element.current,{scrollWheelZoom:false}).setView(point,15);map.current=instance;
      // Normal browser caching and attribution; no prefetch or offline tile archive.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on("tileerror",()=>{if(!disposed)setFailure(true);}).addTo(instance);
      marker.current=L.circleMarker(point,{radius:9,color:"#1d4ed8",fillColor:"#2563eb",fillOpacity:1,weight:3}).bindTooltip("Última posición del repartidor").addTo(instance);
      destination.current=L.circleMarker(point,{radius:7,color:"#0f766e",fillColor:"#14b8a6",fillOpacity:1}).bindTooltip("Destino");
      const target=latest.current.route?.destination;if(target){destination.current.setLatLng([target.latitude,target.longitude]).addTo(instance);}
      line.current=L.polyline([],{color:"#2563eb",weight:4,dashArray:location.source==="DEMO" ? "6 8" : undefined}).addTo(instance);setReady(true);
    }).catch(()=>{if(!disposed)setFailure(true);});
    return()=>{disposed=true;map.current?.remove();map.current=null;marker.current=null;destination.current=null;line.current=null;};
  },[hasLocation]);
  if(!tracking.location)return <p className="mt-4 text-sm text-[var(--muted)]">El mapa aparecerá después de la primera posición.</p>;
  return <div className="mt-4"><div ref={element} role="img" aria-label="Mapa OpenStreetMap con la última posición del repartidor" className="relative z-0 h-72 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]" />{failure ? <p role="status" className="mt-2 text-xs text-[var(--warning)]">El mapa de fondo no respondió. Conservamos el marcador y las coordenadas; la preparación y la entrega siguen disponibles.</p> : null}<p className="mt-2 text-xs leading-5 text-[var(--muted)]">{tracking.location.source==="DEMO" ? "Demostración universitaria: marcador ficticio y segmento ilustrativo hasta el Zócalo. No es una ruta calculada por calles ni una posición real." : route?.encodedPolyline ? "Mapa OpenStreetMap · ruta estimada por Google Routes." : "Mapa OpenStreetMap · última posición. Aún no hay una ruta por calles verificable."}</p></div>;
}
