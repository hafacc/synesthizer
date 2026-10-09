<script lang="ts">
  import { onMount } from "svelte";
  import type { Group, PerspectiveCamera, Scene, WebGLRenderer } from "three";
  import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import type { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
  import { rgb2hslc } from "../colors";
  import { note2midi, orderedNotes, spell } from "../notes";
  import type { Chord } from "../worker-interface";

  const {
    imgdata,
    chord,
    cycles,
  }: {
    imgdata: ImageData | null;
    // the region to show, or null for the whole picture
    chord: Chord | null;
    // how many times the twelve notes go around the hue wheel
    cycles: number;
  } = $props();

  // most points drawn; larger regions are sampled evenly
  const maxPoints = 4000;

  let host: HTMLDivElement;
  // everything three.js needs, loaded once the view is first opened
  let stage = $state.raw<{
    three: typeof import("three");
    Label: typeof import("three/examples/jsm/renderers/CSS2DRenderer.js").CSS2DObject;
    scene: Scene;
    camera: PerspectiveCamera;
    renderer: WebGLRenderer;
    labels: CSS2DRenderer;
    controls: OrbitControls;
    content: Group;
  } | null>(null);

  function inside(
    poly: readonly (readonly [number, number])[],
    x: number,
    y: number,
  ): boolean {
    let within = false;
    for (let index = 0; index < poly.length; ++index) {
      const [fromX, fromY] = poly[index];
      const [toX, toY] = poly[(index + 1) % poly.length];
      if (
        fromY > y !== toY > y &&
        x < ((toX - fromX) * (y - fromY)) / (toY - fromY) + fromX
      ) {
        within = !within;
      }
    }
    return within;
  }

  /** pixels of the region as [x, y, z, red, green, blue] in the HSL cone */
  function sample(img: ImageData, poly: Chord["poly"] | null): number[] {
    const xs = poly ? poly.map(([x]) => x) : [0, img.width];
    const ys = poly ? poly.map(([, y]) => y) : [0, img.height];
    const left = Math.max(0, Math.floor(Math.min(...xs)));
    const right = Math.min(img.width, Math.ceil(Math.max(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const bottom = Math.min(img.height, Math.ceil(Math.max(...ys)));
    const stride = Math.max(
      1,
      Math.ceil(Math.sqrt(((right - left) * (bottom - top)) / maxPoints)),
    );
    const values: number[] = [];
    for (let row = top; row < bottom; row += stride) {
      for (let column = left; column < right; column += stride) {
        if (poly === null || inside(poly, column + 0.5, row + 0.5)) {
          const at = (row * img.width + column) * 4;
          const red = img.data[at];
          const green = img.data[at + 1];
          const blue = img.data[at + 2];
          const [across, deep, up] = rgb2hslc([red, green, blue]);
          // lightness runs up the screen and hue goes around it
          values.push(across, up, deep, red / 255, green / 255, blue / 255);
        }
      }
    }
    return values;
  }

  onMount(() => {
    let disposed = false;
    let cleanup = (): void => {};
    Promise.all([
      import("three"),
      import("three/examples/jsm/controls/OrbitControls.js"),
      import("three/examples/jsm/renderers/CSS2DRenderer.js"),
    ]).then(([three, { OrbitControls }, { CSS2DRenderer, CSS2DObject }]) => {
      if (disposed) return;
      const scene = new three.Scene();
      const camera = new three.PerspectiveCamera(35, 1, 0.1, 10);
      camera.position.set(0, 0.9, 1.9);
      const renderer = new three.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      host.append(renderer.domElement);
      const labels = new CSS2DRenderer();
      labels.domElement.style.position = "absolute";
      labels.domElement.style.inset = "0";
      labels.domElement.style.pointerEvents = "none";
      host.append(labels.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      const content = new three.Group();
      scene.add(content);
      const draw = (): void => {
        renderer.render(scene, camera);
        labels.render(scene, camera);
      };
      controls.addEventListener("change", draw);
      // the panel is still opening when this mounts, so the size comes later
      const sized = new ResizeObserver(() => {
        const size = host.clientWidth;
        renderer.setSize(size, size);
        labels.setSize(size, size);
        draw();
      });
      sized.observe(host);
      stage = {
        three,
        Label: CSS2DObject,
        scene,
        camera,
        renderer,
        labels,
        controls,
        content,
      };
      cleanup = () => {
        sized.disconnect();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        labels.domElement.remove();
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  });

  $effect(() => {
    if (stage !== null) {
      const { three, Label, scene, camera, renderer, labels, content } = stage;
      for (const child of [...content.children]) {
        content.remove(child);
      }
      for (const stale of host.querySelectorAll("[data-note]")) {
        stale.remove();
      }

      // the cone's outline: a ring at mid lightness joined to black and white
      const ring: number[] = [];
      const steps = 12 * cycles;
      for (let step = 0; step < 96; ++step) {
        for (const turn of [step, step + 1]) {
          const angle = (turn / 96) * 2 * Math.PI;
          ring.push(Math.cos(angle) / 2, 0, Math.sin(angle) / 2);
        }
      }
      for (let step = 0; step < steps; ++step) {
        const angle = (step / steps) * 2 * Math.PI;
        const edge = [Math.cos(angle) / 2, 0, Math.sin(angle) / 2];
        ring.push(...edge, 0, 0.5, 0, ...edge, 0, -0.5, 0);
      }
      const outline = new three.BufferGeometry();
      outline.setAttribute("position", new three.Float32BufferAttribute(ring, 3));
      content.add(
        new three.LineSegments(
          outline,
          new three.LineBasicMaterial({
            color: 0x808080,
            transparent: true,
            opacity: 0.35,
          }),
        ),
      );

      const sounding = new Set<number>(
        [...(chord?.notes ?? []), ...(chord?.soft ?? [])].map(
          (name) => note2midi(name) % 12,
        ),
      );
      for (let step = 0; step < steps; ++step) {
        // each note owns one slot of the wheel; its name sits at the middle
        const angle = ((step + 0.5) / steps) * 2 * Math.PI;
        const note = step % 12;
        const element = document.createElement("div");
        element.dataset.note = "";
        element.textContent = spell(orderedNotes[note], chord?.sharps ?? false);
        element.className = sounding.has(note)
          ? "font-note text-[13px] font-bold text-accent"
          : "font-note text-[11px] font-medium text-muted";
        const label = new Label(element);
        label.position.set(Math.cos(angle) * 0.58, 0, Math.sin(angle) * 0.58);
        content.add(label);
      }

      if (imgdata !== null) {
        const values = sample(imgdata, chord?.poly ?? null);
        const positions: number[] = [];
        const colors: number[] = [];
        for (let at = 0; at < values.length; at += 6) {
          positions.push(values[at], values[at + 1], values[at + 2]);
          colors.push(values[at + 3], values[at + 4], values[at + 5]);
        }
        const cloud = new three.BufferGeometry();
        cloud.setAttribute(
          "position",
          new three.Float32BufferAttribute(positions, 3),
        );
        cloud.setAttribute("color", new three.Float32BufferAttribute(colors, 3));
        content.add(
          new three.Points(
            cloud,
            new three.PointsMaterial({
              size: 4,
              sizeAttenuation: false,
              vertexColors: true,
            }),
          ),
        );
      }
      renderer.render(scene, camera);
      labels.render(scene, camera);
    }
  });
</script>

<p class="mb-2 text-[13px] text-muted">
  {chord ? "Colors of this region" : "Colors of the picture"}
</p>
<div
  bind:this={host}
  class="relative aspect-square w-full overflow-hidden rounded bg-wall"
></div>
