from setuptools import find_packages, setup

package_name = "cell_devices"

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
    description="Cell device nodes, FieldIoPort (Modbus TCP) and virtual_plc",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "virtual_plc = cell_devices.virtual_plc_node:main",
            "conveyor_node = cell_devices.conveyor_node:main",
            "flexfeeder_node = cell_devices.flexfeeder_node:main",
            "station_node = cell_devices.station_node:main",
        ],
    },
)
