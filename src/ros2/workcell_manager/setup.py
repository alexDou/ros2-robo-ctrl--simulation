from setuptools import find_packages, setup

package_name = "workcell_manager"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["test"]),
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="alexDou",
    maintainer_email="alex.doo.gm@gmail.com",
    description="Workcell manager and SpindleTower inventory tracking node",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "workcell_node = workcell_manager.workcell_node:main",
        ],
    },
)
