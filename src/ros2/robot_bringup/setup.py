# Copyright 2026 alexDou.
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Setup file for robot_bringup package."""

import os
from glob import glob

from setuptools import find_packages, setup

PACKAGE_NAME = 'robot_bringup'

setup(
    name=PACKAGE_NAME,
    version='0.1.0',
    packages=find_packages(exclude=['test*']),
    data_files=[
        (
            'share/ament_index/resource_index/packages',
            ['resource/' + PACKAGE_NAME],
        ),
        ('share/' + PACKAGE_NAME, ['package.xml']),
        (
            os.path.join('share', PACKAGE_NAME, 'launch'),
            glob('launch/*.launch.py'),
        ),
        (
            os.path.join('share', PACKAGE_NAME, 'config'),
            glob('config/*.yaml'),
        ),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='alexDou',
    maintainer_email='alex.doo.gm@gmail.com',
    description=(
        'ROS2 launch package and bringup configurations for UR5e and workcell'
    ),
    license='Apache-2.0',
    tests_require=['pytest', 'launch_testing'],
    entry_points={
        'console_scripts': [],
    },
)
