"""Faster Voronoi polyhedra for the featurizer, with identical results.

oximachine_featurizer sets the neighbor-search cutoff of pymatgen's VoronoiNN
(used by CrystalNNFingerprint and LocalPropertyStatsNew, twice per metal site)
to the longest diagonal of the cell. VoronoiNN tessellates every periodic image
within that cutoff, so the cost grows with the cube of the cell size: an
elongated 3.8 x 3.8 x 56 Å cell needs ~38 000 points per site (3 s per call).

The Voronoi cell of a site only depends on nearby atoms. If, tessellating the
atoms within a radius r, every vertex of the site's cell lies within r/2 of
it, then no atom farther than r can cut the cell (its bisector plane is
farther than r/2), so the cell is the one any larger cutoff gives. The
replacement below starts from a small radius and doubles it until that holds;
if it never does before the requested cutoff, it falls back to pymatgen's
method with the requested cutoff. Either way the result is the one the
featurizer asked for.

install() swaps the method on pymatgen's VoronoiNN class; it is called when
oximachine_api.features is imported.
"""

import numpy as np
from pymatgen.core.local_env import VoronoiNN
from scipy.spatial import QhullError, Voronoi

# First radius tried (Å): a few coordination shells in typical structures.
INITIAL_RADIUS = 8.0
# Vertices must lie this much inside r/2 (Å), against round-off.
MARGIN = 1e-6

_original = VoronoiNN.get_voronoi_polyhedra


def _bounded_within(voro: Voronoi, radius: float) -> bool:
    """The Voronoi cell of point 0 is bounded and inside radius / 2."""
    region = voro.regions[voro.point_region[0]]
    if not region or -1 in region:
        return False
    vertices = voro.vertices[region] - voro.points[0]
    return float(np.max(np.linalg.norm(vertices, axis=1))) < radius / 2 - MARGIN


def get_voronoi_polyhedra(self, structure, n):
    """VoronoiNN.get_voronoi_polyhedra with the smallest sufficient radius."""
    requested = self.cutoff
    targets = structure.elements if self.targets is None else self.targets
    center = structure[n]
    radius = min(INITIAL_RADIUS, requested)
    while radius < requested:
        neighbors = structure.get_sites_in_sphere(center.coords, radius)
        neighbors = [ngbr[0] for ngbr in sorted(neighbors, key=lambda s: s[1])]
        if len(neighbors) > 4:  # qhull needs at least d + 2 points
            try:
                voro = Voronoi([site.coords for site in neighbors])
                if _bounded_within(voro, radius):
                    return self._extract_cell_info(0, neighbors, targets, voro, self.compute_adj_neighbors)
            except (QhullError, RuntimeError):
                pass  # e.g. too few or coplanar points: try a larger radius
        radius *= 2
    return _original(self, structure, n)


def install() -> None:
    VoronoiNN.get_voronoi_polyhedra = get_voronoi_polyhedra
