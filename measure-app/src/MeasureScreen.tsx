import { useMemo, useReducer, useRef, useState } from 'react';
import {
  GestureResponderEvent, Image, LayoutChangeEvent, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import Svg, { Circle, G, Line as SvgLine, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calibration, Line, Pt, RefSpec, Unit, UNITS, calibrate, dist, format, measureMM, orderQuad, pointsNeeded,
} from './geometry';
import { colors } from './theme';
import type { Photo } from './CameraScreen';

type RefId = 'card' | 'a4' | 'letter' | 'rect' | 'line';
const REFS: { id: RefId; label: string; spec?: RefSpec }[] = [
  { id: 'card', label: 'Bank card', spec: { kind: 'rect', w: 85.6, h: 53.98 } },
  { id: 'a4', label: 'A4 paper', spec: { kind: 'rect', w: 210, h: 297 } },
  { id: 'letter', label: 'US Letter', spec: { kind: 'rect', w: 215.9, h: 279.4 } },
  { id: 'rect', label: 'Custom rectangle' },
  { id: 'line', label: 'Known length' },
];

const HIT_RADIUS = 28; // screen points
const LOUPE = 128; // loupe diameter, screen points
const ZOOM = 3;

// Points and lines are kept in photo pixel coordinates in a mutable model,
// so the touch handlers always see the latest state.
type Model = { refPts: Pt[]; lines: Line[]; pending: Pt | null };

export default function MeasureScreen({ photo, onNewPhoto }: { photo: Photo; onNewPhoto: () => void }) {
  const insets = useSafeAreaInsets();
  const model = useRef<Model>({ refPts: [], lines: [], pending: null }).current;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [unit, setUnit] = useState<Unit>('cm');
  const [refId, setRefId] = useState<RefId>('card');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const [customLen, setCustomLen] = useState('');
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const drag = useRef<{ pt: Pt; dx: number; dy: number } | null>(null);
  const [loupeAt, setLoupeAt] = useState<Pt | null>(null);

  // Fit the photo inside the stage.
  const scale = stage.w && stage.h ? Math.min(stage.w / photo.width, stage.h / photo.height) : 0;
  const dispW = photo.width * scale;
  const dispH = photo.height * scale;
  const offX = (stage.w - dispW) / 2;
  const offY = (stage.h - dispH) / 2;

  const spec: RefSpec = useMemo(() => {
    const preset = REFS.find(r => r.id === refId)?.spec;
    if (preset) return preset;
    const k = UNITS[unit];
    if (refId === 'rect') {
      const w = parseFloat(customW.replace(',', '.'));
      const h = parseFloat(customH.replace(',', '.'));
      return w > 0 && h > 0 ? { kind: 'rect', w: w * k, h: h * k } : { kind: 'invalid', needs: 'rect' };
    }
    const l = parseFloat(customLen.replace(',', '.'));
    return l > 0 ? { kind: 'line', len: l * k } : { kind: 'invalid', needs: 'line' };
  }, [refId, unit, customW, customH, customLen]);

  const cal: Calibration | null = calibrate(spec, model.refPts);
  const needed = pointsNeeded(spec);

  // ---- touch handling ----
  const toPhoto = (e: GestureResponderEvent): Pt => ({
    x: (e.nativeEvent.locationX - offX) / scale,
    y: (e.nativeEvent.locationY - offY) / scale,
  });
  const clamp = (p: Pt): Pt => ({
    x: Math.max(0, Math.min(photo.width, p.x)),
    y: Math.max(0, Math.min(photo.height, p.y)),
  });

  function hit(p: Pt): Pt | null {
    const all = [...model.refPts, ...model.lines.flatMap(l => [l.a, l.b])];
    if (model.pending) all.push(model.pending);
    let best: Pt | null = null;
    let bd = HIT_RADIUS / scale;
    for (const h of all) {
      const d = dist(h, p);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  function addPoint(p: Pt): boolean {
    if (!cal && spec.kind !== 'invalid' && model.refPts.length < needed) {
      model.refPts.push(p);
      return true;
    }
    if (cal) {
      if (!model.pending) model.pending = p;
      else { model.lines.push({ a: model.pending, b: p }); model.pending = null; }
      return true;
    }
    return false;
  }

  const onGrant = (e: GestureResponderEvent) => {
    if (!scale) return;
    const p = toPhoto(e);
    if (p.x < 0 || p.y < 0 || p.x > photo.width || p.y > photo.height) return;
    const h = hit(p);
    if (h) {
      drag.current = { pt: h, dx: h.x - p.x, dy: h.y - p.y };
    } else {
      const np = clamp(p);
      drag.current = addPoint(np) ? { pt: np, dx: 0, dy: 0 } : null;
    }
    setLoupeAt(drag.current ? { ...drag.current.pt } : null);
    redraw();
  };
  const onMove = (e: GestureResponderEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toPhoto(e);
    const c = clamp({ x: p.x + d.dx, y: p.y + d.dy });
    d.pt.x = c.x;
    d.pt.y = c.y;
    setLoupeAt({ ...c });
  };
  const onEnd = () => {
    drag.current = null;
    setLoupeAt(null);
  };

  // ---- actions ----
  const resetRef = () => { model.refPts = []; model.pending = null; redraw(); };
  const undo = () => {
    if (model.pending) model.pending = null;
    else if (model.lines.length) model.lines.pop();
    else model.refPts.pop();
    redraw();
  };
  const clearLines = () => { model.lines = []; model.pending = null; redraw(); };
  const chooseRef = (id: RefId) => { setRefId(id); resetRef(); };

  // ---- status text ----
  let status: string;
  if (spec.kind === 'invalid') status = `Enter the size of your reference in ${unit} below.`;
  else if (!cal) {
    const left = needed - model.refPts.length;
    status = needed === 4
      ? `Step 1 of 2: tap the 4 corners of the ${REFS.find(r => r.id === refId)!.label.toLowerCase()} (${left} left).`
      : `Step 1 of 2: tap both ends of the known length (${left} left).`;
  } else if (model.pending) status = 'Now tap the other end.';
  else if (model.lines.length) status = 'Tap two points for another line. Drag any point to adjust.';
  else status = 'Step 2 of 2: tap the two ends of what you want to measure.';

  // ---- drawing (in stage coordinates) ----
  const S = (p: Pt) => ({ x: offX + p.x * scale, y: offY + p.y * scale });
  const refDraw = (spec.kind === 'rect' && model.refPts.length === 4 ? orderQuad(model.refPts) : model.refPts).map(S);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Camera Measure</Text>
        <View style={styles.segment}>
          {(Object.keys(UNITS) as Unit[]).map(u => (
            <Pressable key={u} onPress={() => setUnit(u)} style={[styles.segBtn, unit === u && styles.segOn]}>
              <Text style={[styles.segText, unit === u && styles.segTextOn]}>{u}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={styles.status} numberOfLines={2}>{status}</Text>

      <View
        style={styles.stage}
        onLayout={(e: LayoutChangeEvent) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onEnd}
        onResponderTerminate={onEnd}
      >
        {scale > 0 && (
          <>
            <Image
              source={{ uri: photo.uri }}
              style={{ position: 'absolute', left: offX, top: offY, width: dispW, height: dispH }}
              pointerEvents="none"
            />
            <Svg width={stage.w} height={stage.h} style={StyleSheet.absoluteFill} pointerEvents="none">
              {refDraw.length === 4 ? (
                <Polygon
                  points={refDraw.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(51,195,255,0.15)" stroke={colors.ref} strokeWidth={2.5}
                />
              ) : refDraw.length > 1 ? (
                <Polyline points={refDraw.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colors.ref} strokeWidth={2.5} />
              ) : null}
              {refDraw.map((p, i) => <Handle key={`r${i}`} p={p} color={colors.ref} />)}

              {model.lines.map((l, i) => {
                const a = S(l.a), b = S(l.b);
                const label = cal ? `${i + 1}: ${format(measureMM(cal, l.a, l.b), unit)}` : '';
                const w = label.length * 8.2 + 14;
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 22;
                return (
                  <G key={`l${i}`}>
                    <SvgLine x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(0,0,0,0.6)" strokeWidth={5} strokeLinecap="round" />
                    <SvgLine x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.line} strokeWidth={2.5} strokeLinecap="round" />
                    <Handle p={a} color={colors.line} />
                    <Handle p={b} color={colors.line} />
                    {label ? (
                      <G>
                        <Rect x={mx - w / 2} y={my - 12} width={w} height={24} rx={6} fill={colors.scrim} />
                        <SvgText x={mx} y={my + 5} fill="#fff" fontSize={14} fontWeight="600" textAnchor="middle">{label}</SvgText>
                      </G>
                    ) : null}
                  </G>
                );
              })}
              {model.pending && <Handle p={S(model.pending)} color={colors.accent} />}
            </Svg>

            {loupeAt && (
              <Loupe
                uri={photo.uri} at={loupeAt} scale={scale} dispW={dispW} dispH={dispH}
                left={S(loupeAt).x < stage.w / 2}
              />
            )}

            {cal && model.lines.length > 0 && (
              <View style={styles.results} pointerEvents="none">
                {model.lines.map((l, i) => (
                  <View key={i} style={styles.resRow}>
                    <Text style={styles.resLabel}>Line {i + 1}</Text>
                    <Text style={styles.resValue}>{format(measureMM(cal, l.a, l.b), unit)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.panel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {REFS.map(r => (
            <Pressable key={r.id} onPress={() => chooseRef(r.id)} style={[styles.chip, refId === r.id && styles.chipOn]}>
              <Text style={[styles.chipText, refId === r.id && styles.chipTextOn]}>{r.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {refId === 'rect' && (
          <View style={styles.inputs}>
            <NumInput value={customW} onChange={v => { setCustomW(v); }} placeholder={`Width (${unit})`} />
            <Text style={styles.times}>×</Text>
            <NumInput value={customH} onChange={v => { setCustomH(v); }} placeholder={`Height (${unit})`} />
          </View>
        )}
        {refId === 'line' && (
          <View style={styles.inputs}>
            <NumInput value={customLen} onChange={setCustomLen} placeholder={`Length (${unit})`} />
          </View>
        )}
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ActionBtn label="Undo" onPress={undo} />
          <ActionBtn label="Recalibrate" onPress={resetRef} />
          <ActionBtn label="Clear lines" onPress={clearLines} />
          <ActionBtn label="New photo" onPress={onNewPhoto} primary />
        </View>
      </View>
    </View>
  );
}

function Handle({ p, color }: { p: Pt; color: string }) {
  return (
    <G>
      <Circle cx={p.x} cy={p.y} r={10} fill="rgba(0,0,0,0.35)" stroke={color} strokeWidth={2} />
      <Circle cx={p.x} cy={p.y} r={2} fill={color} />
    </G>
  );
}

// A magnified view of the photo around the point being dragged, so the
// finger doesn't hide what you're aiming at.
function Loupe({ uri, at, scale, dispW, dispH, left }: {
  uri: string; at: Pt; scale: number; dispW: number; dispH: number; left: boolean;
}) {
  const r = LOUPE / 2;
  return (
    <View pointerEvents="none" style={[styles.loupe, left ? { right: 12 } : { left: 12 }]}>
      <Image
        source={{ uri }}
        style={{
          position: 'absolute',
          width: dispW * ZOOM,
          height: dispH * ZOOM,
          left: r - at.x * scale * ZOOM,
          top: r - at.y * scale * ZOOM,
        }}
      />
      <View style={[styles.cross, { left: r - 0.75, top: 0, width: 1.5, height: LOUPE }]} />
      <View style={[styles.cross, { top: r - 0.75, left: 0, height: 1.5, width: LOUPE }]} />
    </View>
  );
}

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      keyboardType="decimal-pad"
      style={styles.input}
    />
  );
}

function ActionBtn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.actionText, primary && { color: colors.inkOnAccent }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: colors.control, borderRadius: 10, padding: 3 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  segOn: { backgroundColor: colors.accent },
  segText: { color: colors.muted, fontWeight: '600' },
  segTextOn: { color: colors.inkOnAccent },
  status: { color: colors.text, fontSize: 14, lineHeight: 20, height: 48, paddingHorizontal: 16 },
  stage: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  loupe: {
    position: 'absolute', top: 12, width: LOUPE, height: LOUPE, borderRadius: LOUPE / 2,
    overflow: 'hidden', borderWidth: 2, borderColor: colors.accent, backgroundColor: '#000',
  },
  cross: { position: 'absolute', backgroundColor: colors.accent, opacity: 0.8 },
  results: {
    position: 'absolute', left: 10, bottom: 10, backgroundColor: colors.scrim,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, minWidth: 150,
  },
  resRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 3 },
  resLabel: { color: colors.muted, fontSize: 14 },
  resValue: { color: colors.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  panel: { backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.border },
  chips: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: colors.control, borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { borderColor: colors.ref, backgroundColor: 'rgba(51,195,255,0.15)' },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextOn: { color: colors.ref },
  inputs: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  input: {
    flex: 1, color: colors.text, backgroundColor: colors.control, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
  },
  times: { color: colors.muted, fontSize: 18 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  action: {
    flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.control, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 4,
  },
  actionPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  actionText: { color: colors.text, fontWeight: '600', fontSize: 13 },
});
