"""Denavit-Hartenberg 4x4 helpers (pure Python)."""

import math

def _dh_matrix(theta: float, d: float, a: float, alpha: float) -> list[list[float]]:
    """Computes standard Denavit-Hartenberg 4x4 homogeneous transformation matrix."""
    ct = math.cos(theta)
    st = math.sin(theta)
    ca = math.cos(alpha)
    sa = math.sin(alpha)
    return [
        [ct, -st * ca, st * sa, a * ct],
        [st, ct * ca, -ct * sa, a * st],
        [0.0, sa, ca, d],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _invert_rigid_transform(t: list[list[float]]) -> list[list[float]]:
    """Inverts an orthonormal 4x4 rigid transformation matrix: [R, p]^-1 = [R^T, -R^T * p]."""
    r_inv = [[t[j][i] for j in range(3)] for i in range(3)]
    p = [t[i][3] for i in range(3)]
    p_inv = [
        -(r_inv[i][0] * p[0] + r_inv[i][1] * p[1] + r_inv[i][2] * p[2])
        for i in range(3)
    ]
    return [
        [r_inv[0][0], r_inv[0][1], r_inv[0][2], p_inv[0]],
        [r_inv[1][0], r_inv[1][1], r_inv[1][2], p_inv[1]],
        [r_inv[2][0], r_inv[2][1], r_inv[2][2], p_inv[2]],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _matmul_4x4(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    """Multiplies two 4x4 matrices in pure Python."""
    return [
        [sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)]
        for i in range(4)
    ]
