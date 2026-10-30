import { riskLevelForNode, type GraphNode } from "../components/graph/types";

interface GraphLink {
  source: string | number | GraphNode;
  target: string | number | GraphNode;
}

interface RawGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

function resolveId(e: string | number | GraphNode): string | number {
  return typeof e === "object" ? e.id : e;
}

export function applyStableLayout(graph: RawGraph): RawGraph {
  const radius = Math.max(70, 18 * Math.sqrt(graph.nodes.length));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return {
    nodes: graph.nodes.map((node, index) => {
      if ([node.x, node.y, node.z].every((coordinate) => Number.isFinite(coordinate))) {
        return node;
      }

      const vertical = 1 - (2 * (index + 0.5)) / graph.nodes.length;
      const horizontalRadius = Math.sqrt(1 - vertical * vertical);
      const angle = index * goldenAngle;

      return {
        ...node,
        x: radius * horizontalRadius * Math.cos(angle),
        y: radius * vertical,
        z: radius * horizontalRadius * Math.sin(angle),
      };
    }),
    links: graph.links.map((link) => ({
      ...link,
      source: resolveId(link.source),
      target: resolveId(link.target),
    })),
  };
}

function assignClusters(graph: RawGraph): Map<string | number, number> {
  const clusters = new Map<string | number, number>();

  
  const degree = new Map<string | number, number>();
  graph.nodes.forEach((n) => degree.set(n.id, 0));
  graph.links.forEach((l) => {
    const s = resolveId(l.source);
    const t = resolveId(l.target);
    degree.set(s, (degree.get(s) ?? 0) + 1);
    degree.set(t, (degree.get(t) ?? 0) + 1);
  });

  // Keep high-risk accounts together; group safe and medium-risk accounts by degree.
  const nonHighRiskNodes = graph.nodes.filter((node) => riskLevelForNode(node) !== "HIGH");
  const degrees = nonHighRiskNodes.map((n) => degree.get(n.id) ?? 0).sort((a, b) => a - b);
  const q1 = degrees[Math.floor(degrees.length * 0.33)] ?? 0;
  const q2 = degrees[Math.floor(degrees.length * 0.66)] ?? 0;

  graph.nodes.forEach((n) => {
    if (riskLevelForNode(n) === "HIGH") {
      clusters.set(n.id, 0);
    } else {
      const d = degree.get(n.id) ?? 0;
      if (d <= q1) clusters.set(n.id, 1);
      else if (d <= q2) clusters.set(n.id, 2);
      else clusters.set(n.id, 3);
    }
  });

  return clusters;
}

// Place cluster centers evenly on a sphere
function clusterCenters(
  numClusters: number,
  radius: number
): Array<{ x: number; y: number; z: number }> {
  const centers: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < numClusters; i++) {
    // Golden angle spiral for even sphere distribution
    const theta = Math.acos(1 - (2 * (i + 0.5)) / numClusters);
    const phi = Math.PI * (1 + Math.sqrt(5)) * i;
    centers.push({
      x: radius * Math.sin(theta) * Math.cos(phi),
      y: radius * Math.sin(theta) * Math.sin(phi),
      z: radius * Math.cos(theta),
    });
  }

  return centers;
}

export function applyBundleLayout(graph: RawGraph): RawGraph {
  const NUM_CLUSTERS = 4; // 0=high risk, 1-3=other accounts by degree
  const CLUSTER_RADIUS = 160;  // distance between cluster centers
  const NODE_SPREAD = 35;      // scatter radius within each cluster

  const clusters = assignClusters(graph);
  const centers = clusterCenters(NUM_CLUSTERS, CLUSTER_RADIUS);

  // Seed-based deterministic scatter so layout is stable
  let seed = 42;
  function seededRand() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  const positionedNodes = graph.nodes.map((node) => {
    const clusterId = clusters.get(node.id) ?? 0;
    const center = centers[clusterId];

    // Uniform random point on small sphere around cluster center
    const u = seededRand() * 2 - 1;
    const theta = seededRand() * Math.PI * 2;
    const r = NODE_SPREAD * Math.cbrt(seededRand()); // cbrt = uniform volume fill

    return {
      ...node,
      x: center.x + r * Math.sqrt(1 - u * u) * Math.cos(theta),
      y: center.y + r * Math.sqrt(1 - u * u) * Math.sin(theta),
      z: center.z + r * u,
      // Freeze positions so force-graph doesn't re-scatter them
      fx: center.x + r * Math.sqrt(1 - u * u) * Math.cos(theta),
      fy: center.y + r * Math.sqrt(1 - u * u) * Math.sin(theta),
      fz: center.z + r * u,
    };
  });

  return { nodes: positionedNodes, links: graph.links };
}

// Remove fx/fy/fz so force simulation takes back over
export function removeBundleLayout(graph: RawGraph): RawGraph {
  return {
    nodes: graph.nodes.map((node) => {
      const unfixedNode = { ...node } as GraphNode & {
        fx?: number;
        fy?: number;
        fz?: number;
      };
      delete unfixedNode.fx;
      delete unfixedNode.fy;
      delete unfixedNode.fz;
      return unfixedNode;
    }),
    links: graph.links,
  };
}