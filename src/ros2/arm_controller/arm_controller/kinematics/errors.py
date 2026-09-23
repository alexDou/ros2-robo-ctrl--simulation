"""Kinematics exception hierarchy."""



class KinematicsError(Exception):
    """Base exception for kinematics errors."""


class OutOfReachError(KinematicsError):
    """Raised when target coordinates fall outside robot reach boundaries."""


UnreachableTargetError = OutOfReachError


class KinematicSingularityError(KinematicsError):
    """Raised when target pose is near a kinematic singularity with no valid solution."""
