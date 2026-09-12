#!/usr/bin/env python3
"""Generate domain models for Rust, Python, and TypeScript from canonical JSON schemas."""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import json
from pathlib import Path
import re
import sys
from typing import Any


def to_pascal_case(s: str) -> str:
    return "".join(word.capitalize() for word in s.replace("-", "_").split("_"))


def to_camel_case(s: str) -> str:
    s = to_snake_case(s)
    parts = s.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


def to_snake_case(s: str) -> str:
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", s)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower().replace("-", "_")


@dataclass
class EnumDef:
    name: str
    variants: list[str]
    description: str = ""


@dataclass
class ConstantDef:
    name: str
    alias: str
    item_type: str
    items: list[str]
    description: str = ""


@dataclass
class ScalarConstantDef:
    name: str
    value: str
    description: str = ""


@dataclass
class FixedArrayDef:
    name: str
    item_type: str
    count: int
    description: str = ""


@dataclass
class FieldDef:
    name: str
    kind: str  # "literal", "string", "int", "float", "bool", "enum", "model", "fixed_array", "generic_map"
    ref: str = ""  # target enum/model/fixed_array name or literal value
    required: bool = True
    description: str = ""
    minimum: float | int | None = None
    maximum: float | int | None = None
    min_length: int | None = None
    max_length: int | None = None
    pattern: str | None = None
    format: str | None = None


@dataclass
class ModelDef:
    name: str
    description: str
    fields: list[FieldDef] = field(default_factory=list)
    channel: str | None = None
    is_submodel: bool = False
    additional_properties: bool = True


@dataclass
class DomainIR:
    enums: list[EnumDef] = field(default_factory=list)
    constants: list[ConstantDef] = field(default_factory=list)
    scalar_constants: list[ScalarConstantDef] = field(default_factory=list)
    fixed_arrays: list[FixedArrayDef] = field(default_factory=list)
    models: list[ModelDef] = field(default_factory=list)
    channels: list[str] = field(default_factory=list)


def parse_schemas(schemas_dir: Path) -> DomainIR:
    ir = DomainIR()
    seen_enums: set[str] = set()
    seen_models: dict[str, ModelDef] = {}
    seen_fixed_arrays: set[str] = set()

    schema_files = sorted(schemas_dir.glob("*.schema.json"))
    raw_schemas = []
    for sf in schema_files:
        with open(sf, "r", encoding="utf-8") as f:
            data = json.load(f)
            raw_schemas.append(data)

    def parse_property(prop_name: str, prop_schema: dict, is_required: bool) -> FieldDef:
        desc = prop_schema.get("description", "")
        if "const" in prop_schema:
            return FieldDef(
                name=prop_name,
                kind="literal",
                ref=str(prop_schema["const"]),
                required=is_required,
                description=desc,
            )

        if prop_schema.get("type") == "string" and "enum" in prop_schema:
            enum_name = prop_schema.get("title") or to_pascal_case(prop_name)
            if enum_name not in seen_enums:
                ir.enums.append(EnumDef(name=enum_name, variants=prop_schema["enum"], description=desc))
                seen_enums.add(enum_name)
            return FieldDef(
                name=prop_name,
                kind="enum",
                ref=enum_name,
                required=is_required,
                description=desc,
            )

        if prop_schema.get("type") == "string":
            return FieldDef(
                name=prop_name,
                kind="string",
                required=is_required,
                description=desc,
                min_length=prop_schema.get("minLength"),
                max_length=prop_schema.get("maxLength"),
                pattern=prop_schema.get("pattern"),
                format=prop_schema.get("format"),
            )

        if prop_schema.get("type") == "integer":
            return FieldDef(
                name=prop_name,
                kind="int",
                required=is_required,
                description=desc,
                minimum=prop_schema.get("minimum"),
                maximum=prop_schema.get("maximum"),
            )

        if prop_schema.get("type") == "number":
            return FieldDef(
                name=prop_name,
                kind="float",
                required=is_required,
                description=desc,
                minimum=prop_schema.get("minimum"),
                maximum=prop_schema.get("maximum"),
            )

        if prop_schema.get("type") == "boolean":
            return FieldDef(
                name=prop_name,
                kind="bool",
                required=is_required,
                description=desc,
            )

        if prop_schema.get("type") == "array":
            min_items = prop_schema.get("minItems")
            max_items = prop_schema.get("maxItems")
            if min_items is not None and min_items == max_items:
                array_title = prop_schema.get("title") or to_pascal_case(prop_name)
                if array_title not in seen_fixed_arrays:
                    ir.fixed_arrays.append(FixedArrayDef(
                        name=array_title,
                        item_type="float",
                        count=min_items,
                        description=desc,
                    ))
                    seen_fixed_arrays.add(array_title)
                return FieldDef(
                    name=prop_name,
                    kind="fixed_array",
                    ref=array_title,
                    required=is_required,
                    description=desc,
                    minimum=min_items,
                    maximum=max_items,
                )
            return FieldDef(
                name=prop_name,
                kind="array",
                ref=prop_schema.get("items", {}).get("type", "string"),
                required=is_required,
                description=desc,
            )

        if prop_schema.get("type") == "object":
            if "properties" in prop_schema:
                sub_model_name = prop_schema.get("title") or to_pascal_case(prop_name)
                parse_object_model(sub_model_name, prop_schema, is_submodel=True)
                return FieldDef(
                    name=prop_name,
                    kind="model",
                    ref=sub_model_name,
                    required=is_required,
                    description=desc,
                )
            return FieldDef(
                name=prop_name,
                kind="generic_map",
                required=is_required,
                description=desc,
            )

        if "$ref" in prop_schema:
            target = prop_schema["$ref"].split("/")[-1]
            return FieldDef(
                name=prop_name,
                kind="model",
                ref=target,
                required=is_required,
                description=desc,
            )

        raise ValueError(f"Unknown property schema for {prop_name}: {prop_schema}")

    def parse_object_model(name: str, schema: dict, is_submodel: bool = False, channel: str | None = None) -> ModelDef:
        if name in seen_models:
            return seen_models[name]

        model = ModelDef(
            name=name,
            description=schema.get("description", ""),
            channel=channel,
            is_submodel=is_submodel,
            additional_properties=schema.get("additionalProperties", True),
        )
        required_set = set(schema.get("required", []))
        for p_name, p_schema in schema.get("properties", {}).items():
            field_def = parse_property(p_name, p_schema, p_name in required_set)
            model.fields.append(field_def)

        seen_models[name] = model
        return model

    # First pass: parse consts and $defs
    for schema in raw_schemas:
        consts = schema.get("consts", {})
        for c_name, c_info in consts.items():
            if isinstance(c_info, dict):
                val = c_info.get("value")
                desc = c_info.get("description", "")
            else:
                val = c_info
                desc = ""
            if val is not None and not any(sc.name == c_name for sc in ir.scalar_constants):
                ir.scalar_constants.append(ScalarConstantDef(
                    name=c_name,
                    value=str(val),
                    description=desc,
                ))

        defs = schema.get("$defs", {})
        for d_name, d_schema in defs.items():
            if "const" in d_schema:
                const_name = d_schema.get("x-constant-name") or d_name.upper()
                const_val = str(d_schema["const"])
                desc = d_schema.get("description", "")
                if not any(sc.name == const_name for sc in ir.scalar_constants):
                    ir.scalar_constants.append(ScalarConstantDef(
                        name=const_name,
                        value=const_val,
                        description=desc,
                    ))
            elif d_schema.get("type") == "string" and "enum" in d_schema:
                enum_name = d_schema.get("title") or to_pascal_case(d_name)
                const_name = d_schema.get("x-constant-name")
                const_alias = d_schema.get("x-constant-alias")
                if const_name:
                    ir.constants.append(ConstantDef(
                        name=const_name,
                        alias=const_alias or const_name,
                        item_type=enum_name,
                        items=d_schema["enum"],
                        description=d_schema.get("description", ""),
                    ))
                elif enum_name not in seen_enums:
                    ir.enums.append(EnumDef(name=enum_name, variants=d_schema["enum"], description=d_schema.get("description", "")))
                    seen_enums.add(enum_name)
            elif d_schema.get("type") == "object":
                sub_name = d_schema.get("title") or to_pascal_case(d_name)
                parse_object_model(sub_name, d_schema, is_submodel=True)

    # Second pass: parse root models & channels
    for schema in raw_schemas:
        channel = schema.get("x-datafabric-channel")
        if channel and channel not in ir.channels:
            ir.channels.append(channel)
        if schema.get("type") == "object":
            root_name = schema.get("title") or "RootModel"
            parse_object_model(root_name, schema, is_submodel=False, channel=channel)

    # Topological order: submodels first, root models second
    submodels = [m for m in seen_models.values() if m.is_submodel]
    rootmodels = [m for m in seen_models.values() if not m.is_submodel]
    ir.models = submodels + rootmodels

    return ir


def emit_rust(ir: DomainIR) -> str:
    lines = [
        "// Auto-generated by scripts/generate_domain.py. DO NOT EDIT DIRECTLY.",
        "use serde::{Deserialize, Deserializer, Serialize};",
        "use thiserror::Error;",
        "",
        "/// Error types encountered in domain validation and key resolution.",
        "#[derive(Debug, Error, PartialEq, Eq)]",
        "pub enum DomainError {",
        '    #[error("Invalid robot ID: must be non-empty and not contain slashes")]',
        "    InvalidRobotId,",
    ]
    if ir.fixed_arrays:
        lines.append('    #[error("Invalid joint positions: must contain finite float values")]')
        lines.append("    InvalidJointPositions,")
    lines.append("}")

    for e in ir.enums:
        lines.append("")
        if e.description:
            lines.append(f"/// {e.description}")
        lines.append("#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]")
        lines.append('#[serde(rename_all = "SCREAMING_SNAKE_CASE")]')
        lines.append(f"pub enum {e.name} {{")
        for v in e.variants:
            lines.append(f"    {to_pascal_case(v)},")
        lines.append("}")

    for c in ir.constants:
        lines.append("")
        if c.description:
            lines.append(f"/// {c.description}")
        lines.append(f"pub const {c.name}: [&str; {len(c.items)}] = [")
        for item in c.items:
            lines.append(f'    "{item}",')
        lines.append("];")
        lines.append("")
        lines.append(f"/// Alias for canonical joint names.")
        lines.append(f"pub const {c.alias}: [&str; {len(c.items)}] = {c.name};")

    for sc in ir.scalar_constants:
        lines.append("")
        if sc.description:
            lines.append(f"/// {sc.description}")
        lines.append(f'pub const {sc.name}: &str = "{sc.value}";')

    for fa in ir.fixed_arrays:
        lines.append("")
        lines.append(f"/// Array of exactly {fa.count} joint positions in radians.")
        lines.append(f"pub type {fa.name} = [f64; {fa.count}];")

    if ir.fixed_arrays:
        lines.append("")
        lines.append("fn deserialize_finite_joints<'de, D>(deserializer: D) -> Result<ArmJointPositions, D::Error>")
        lines.append("where")
        lines.append("    D: Deserializer<'de>,")
        lines.append("{")
        lines.append("    let arr = <ArmJointPositions>::deserialize(deserializer)?;")
        lines.append("    for (idx, &val) in arr.iter().enumerate() {")
        lines.append("        if !val.is_finite() {")
        lines.append("            return Err(serde::de::Error::custom(format!(")
        lines.append('                "Joint position at index {idx} must be a finite number"')
        lines.append("            )));")
        lines.append("        }")
        lines.append("    }")
        lines.append("    Ok(arr)")
        lines.append("}")
        lines.append("")
        lines.append("/// Validates that an array of joint positions contains only finite floats.")
        lines.append("///")
        lines.append("/// # Errors")
        lines.append("/// Returns [`DomainError::InvalidJointPositions`] if any joint position is non-finite (NaN or Inf).")
        lines.append("pub fn validate_joint_positions(joint_positions: &ArmJointPositions) -> Result<(), DomainError> {")
        lines.append("    if !joint_positions.iter().all(|&p| p.is_finite()) {")
        lines.append("        return Err(DomainError::InvalidJointPositions);")
        lines.append("    }")
        lines.append("    Ok(())")
        lines.append("}")

    for m in ir.models:
        lines.append("")
        if m.description:
            lines.append(f"/// {m.description}")

        has_float = any(f.kind in ("float", "fixed_array") for f in m.fields)
        eq_derive = "" if has_float else ", Eq"
        lines.append(f"#[derive(Debug, Clone, PartialEq{eq_derive}, Serialize, Deserialize)]")
        lines.append(f"pub struct {m.name} {{")
        for f in m.fields:
            fname = f"r#{f.name}" if f.name == "type" else f.name
            if f.kind == "literal":
                lines.append(f"    pub {fname}: String,")
            elif f.kind == "string":
                t = "Option<String>" if not f.required else "String"
                attr = '#[serde(default, skip_serializing_if = "Option::is_none")]\n    ' if not f.required else ""
                lines.append(f"    {attr}pub {fname}: {t},")
            elif f.kind == "int":
                int_t = "u64" if f.minimum is not None and f.minimum >= 0 else "i64"
                t = f"Option<{int_t}>" if not f.required else int_t
                attr = '#[serde(default, skip_serializing_if = "Option::is_none")]\n    ' if not f.required else ""
                lines.append(f"    {attr}pub {fname}: {t},")
            elif f.kind == "float":
                t = "Option<f64>" if not f.required else "f64"
                attr = '#[serde(default, skip_serializing_if = "Option::is_none")]\n    ' if not f.required else ""
                lines.append(f"    {attr}pub {fname}: {t},")
            elif f.kind == "bool":
                t = "Option<bool>" if not f.required else "bool"
                attr = '#[serde(default, skip_serializing_if = "Option::is_none")]\n    ' if not f.required else ""
                lines.append(f"    {attr}pub {fname}: {t},")
            elif f.kind in ("enum", "model"):
                t = f"Option<{f.ref}>" if not f.required else f.ref
                attr = '#[serde(default, skip_serializing_if = "Option::is_none")]\n    ' if not f.required else ""
                lines.append(f"    {attr}pub {fname}: {t},")
            elif f.kind == "fixed_array":
                lines.append('    #[serde(deserialize_with = "deserialize_finite_joints")]')
                lines.append(f"    pub {fname}: {f.ref},")
            elif f.kind == "generic_map":
                lines.append(f"    pub {fname}: serde_json::Value,")
        lines.append("}")

        has_fixed_array = any(f.kind == "fixed_array" for f in m.fields)
        if has_fixed_array:
            lines.append("")
            lines.append(f"impl {m.name} {{")
            lines.append("    /// Validates domain invariants (e.g., all joint positions are finite numbers).")
            lines.append("    ///")
            lines.append("    /// # Errors")
            lines.append("    /// Returns [`DomainError::InvalidJointPositions`] if any joint position is non-finite (NaN or Inf).")
            lines.append("    pub fn validate(&self) -> Result<(), DomainError> {")
            lines.append("        validate_joint_positions(&self.joint_positions)")
            lines.append("    }")
            lines.append("}")

        literal_fields = [f for f in m.fields if f.kind == "literal"]
        if literal_fields:
            non_literal_fields = [f for f in m.fields if f.kind != "literal"]
            params = []
            for f in non_literal_fields:
                if f.kind == "string":
                    params.append(f"{f.name}: impl Into<String>")
                elif f.kind == "int":
                    int_t = "u64" if f.minimum is not None and f.minimum >= 0 else "i64"
                    params.append(f"{f.name}: {int_t}")
                elif f.kind == "float":
                    params.append(f"{f.name}: f64")
                elif f.kind == "bool":
                    params.append(f"{f.name}: bool")
                elif f.kind in ("enum", "model", "fixed_array"):
                    params.append(f"{f.name}: {f.ref}")
            lines.append("")
            lines.append(f"impl {m.name} {{")
            lines.append("    #[must_use]")
            lines.append(f"    pub fn new({', '.join(params)}) -> Self {{")
            lines.append("        Self {")
            for f in m.fields:
                fname = f"r#{f.name}" if f.name == "type" else f.name
                if f.kind == "literal":
                    lines.append(f'            {fname}: "{f.ref}".to_string(),')
                elif f.kind == "string":
                    lines.append(f"            {fname}: {f.name}.into(),")
                elif fname == f.name:
                    lines.append(f"            {fname},")
                else:
                    lines.append(f"            {fname}: {f.name},")
            lines.append("        }")
            lines.append("    }")
            lines.append("}")

    if ir.channels:
        lines.append("")
        lines.append("/// Validates that a robot identifier is structurally valid.")
        lines.append("fn validate_robot_id(robot_id: &str) -> Result<(), DomainError> {")
        lines.append("    if robot_id.is_empty() || robot_id.contains('/') || robot_id.contains('\\\\') || robot_id.contains(' ') {")
        lines.append("        return Err(DomainError::InvalidRobotId);")
        lines.append("    }")
        lines.append("    Ok(())")
        lines.append("}")

        for ch in ir.channels:
            lines.append("")
            lines.append(f"/// Returns the locked DataFabric {ch} key expression for a robot.")
            lines.append("///")
            lines.append("/// # Errors")
            lines.append("/// Returns [`DomainError::InvalidRobotId`] if `robot_id` is empty or contains path delimiters.")
            lines.append(f"pub fn robot_{ch}_topic(robot_id: &str) -> Result<String, DomainError> {{")
            lines.append("    validate_robot_id(robot_id)?;")
            lines.append(f'    Ok(format!("robot/{{robot_id}}/{ch}"))')
            lines.append("}")

        lines.append("")
        lines.append("/// Parses a DataFabric key expression into robot ID and channel.")
        lines.append("#[must_use]")
        lines.append("pub fn parse_robot_topic(topic: &str) -> Option<(String, &'static str)> {")
        lines.append("    let parts: Vec<&str> = topic.split('/').collect();")
        lines.append('    if parts.len() != 3 || parts[0] != "robot" || parts[1].is_empty() {')
        lines.append("        return None;")
        lines.append("    }")
        lines.append("")
        lines.append("    match parts[2] {")
        for ch in ir.channels:
            lines.append(f'        "{ch}" => Some((parts[1].to_string(), "{ch}")),')
        lines.append("        _ => None,")
        lines.append("    }")
        lines.append("}")

    lines.append("")
    return "\n".join(lines)


def emit_python(ir: DomainIR) -> str:
    lines = [
        "# Auto-generated by scripts/generate_domain.py. DO NOT EDIT DIRECTLY.",
        '"""Domain schemas and DataFabric topic contracts for EdgeNode."""',
        "",
        "from enum import Enum",
        "from typing import Annotated, Any, Literal, Optional",
        "from pydantic import BaseModel, ConfigDict, Field",
    ]

    for e in ir.enums:
        lines.append("")
        lines.append("")
        lines.append(f"class {e.name}(str, Enum):")
        if e.description:
            lines.append(f'    """{e.description}"""')
            lines.append("")
        for v in e.variants:
            lines.append(f'    {v} = "{v}"')

    for c in ir.constants:
        lines.append("")
        lines.append("")
        lines.append(f"{c.name}: list[str] = [")
        for item in c.items:
            lines.append(f'    "{item}",')
        lines.append("]")
        lines.append("")
        lines.append(f"{c.alias}: list[str] = {c.name}")
        lines.append("")
        lines.append(f"{c.item_type} = Literal[")
        for item in c.items:
            lines.append(f'    "{item}",')
        lines.append("]")

    for sc in ir.scalar_constants:
        lines.append("")
        lines.append(f'{sc.name}: str = "{sc.value}"')

    if ir.fixed_arrays:
        lines.append("")
        lines.append("")
        lines.append("FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]")
        for fa in ir.fixed_arrays:
            lines.append(
                f'{fa.name} = Annotated[list[FiniteFloat], Field(min_length={fa.count}, max_length={fa.count}, description="{fa.description}")]'
            )

    for m in ir.models:
        lines.append("")
        lines.append("")
        lines.append(f"class {m.name}(BaseModel):")
        if m.description:
            lines.append(f'    """{m.description}"""')
            lines.append("")
        lines.append('    model_config = ConfigDict(extra="forbid")')
        lines.append("")
        for f in m.fields:
            if f.kind == "literal":
                lines.append(f'    {f.name}: Literal["{f.ref}"] = "{f.ref}"')
            elif f.kind == "string":
                args = ["default=None"] if not f.required else ["..."]
                if f.min_length is not None:
                    args.append(f"min_length={f.min_length}")
                if f.description:
                    args.append(f'description="{f.description}"')
                type_str = "Optional[str]" if not f.required else "str"
                lines.append(f"    {f.name}: {type_str} = Field({', '.join(args)})")
            elif f.kind == "int":
                args = ["default=None"] if not f.required else ["..."]
                if f.minimum is not None:
                    args.append(f"ge={f.minimum}")
                if f.maximum is not None:
                    args.append(f"le={f.maximum}")
                if f.description:
                    args.append(f'description="{f.description}"')
                type_str = "Optional[int]" if not f.required else "int"
                lines.append(f"    {f.name}: {type_str} = Field({', '.join(args)})")
            elif f.kind == "float":
                args = ["default=None"] if not f.required else ["..."]
                if f.minimum is not None:
                    args.append(f"ge={f.minimum}")
                if f.maximum is not None:
                    args.append(f"le={f.maximum}")
                if f.description:
                    args.append(f'description="{f.description}"')
                type_str = "Optional[float]" if not f.required else "float"
                lines.append(f"    {f.name}: {type_str} = Field({', '.join(args)})")
            elif f.kind == "bool":
                type_str = "Optional[bool]" if not f.required else "bool"
                lines.append(f"    {f.name}: {type_str} = Field(...)")
            elif f.kind in ("enum", "model"):
                args = ["default=None"] if not f.required else ["..."]
                if f.description:
                    args.append(f'description="{f.description}"')
                type_str = f"Optional[{f.ref}]" if not f.required else f.ref
                lines.append(f"    {f.name}: {type_str} = Field({', '.join(args)})")
            elif f.kind == "fixed_array":
                if not f.required:
                    lines.append(f"    {f.name}: Optional[{f.ref}] = Field(default=None)")
                else:
                    lines.append(f"    {f.name}: {f.ref}")
            elif f.kind == "generic_map":
                args = ["default_factory=dict"]
                if f.description:
                    args.append(f'description="{f.description}"')
                lines.append(f"    {f.name}: dict[str, Any] = Field({', '.join(args)})")

    if ir.channels:
        lines.append("")
        lines.append("")
        lines.append("def _validate_robot_id(robot_id: str) -> None:")
        lines.append('    if not robot_id or "/" in robot_id or "\\\\" in robot_id or " " in robot_id:')
        lines.append('        raise ValueError(f"Invalid robot ID \'{robot_id}\': must be non-empty and not contain slashes or whitespace")')

        for ch in ir.channels:
            lines.append("")
            lines.append("")
            lines.append(f"def robot_{ch}_topic(robot_id: str) -> str:")
            lines.append(f'    """Returns the locked DataFabric {ch} key expression for a robot."""')
            lines.append("    _validate_robot_id(robot_id)")
            lines.append(f'    return f"robot/{{robot_id}}/{ch}"')

        valid_channels = ", ".join(f'"{c}"' for c in ir.channels)
        lines.append("")
        lines.append("")
        lines.append("def parse_robot_topic(topic: str) -> tuple[str, str] | None:")
        lines.append('    """Parses a DataFabric key expression into (robot_id, channel) or returns None if invalid."""')
        lines.append('    parts = topic.split("/")')
        lines.append('    if len(parts) != 3 or parts[0] != "robot" or not parts[1]:')
        lines.append("        return None")
        lines.append(f"    if parts[2] not in ({valid_channels}):")
        lines.append("        return None")
        lines.append("    return (parts[1], parts[2])")

    lines.append("")
    return "\n".join(lines)


def _ts_field_to_zod(f: FieldDef) -> str:
    if f.kind == "literal":
        base = f"z.literal('{f.ref}', {{ message: \"Expected frame type '{f.ref}'\" }})"
        return base if f.required else f"{base}.nullish()"

    if f.kind == "string":
        parts = []
        if f.required:
            parts.append(f"z.string({{ message: \"Missing required field '{f.name}'\" }})")
        else:
            parts.append("z.string()")

        if f.min_length is not None:
            if f.required and f.min_length >= 1:
                desc = f"Field '{f.name}' must be non-empty" if f.name == "detected_object" else f"Missing required field '{f.name}'"
                parts.append(f".min({f.min_length}, {{ message: \"{desc}\" }})")
            else:
                parts.append(f".min({f.min_length})")

        if f.max_length is not None:
            parts.append(f".max({f.max_length})")

        if f.pattern is not None:
            parts.append(f".regex(new RegExp({json.dumps(f.pattern)}))")

        res = "".join(parts)
        return res if f.required else f"{res}.nullish()"

    if f.kind == "int":
        if f.name == "timestamp_ns":
            return "timestampNsSchema" if f.required else "timestampNsSchema.nullish()"
        parts = [f"z.union([z.bigint(), z.number(), z.string()], {{ message: \"Missing required field '{f.name}'\" }})"]
        if f.minimum is not None:
            parts.append(f""".refine(
      (val) => {{
        try {{
          if (typeof val === 'number' && !Number.isFinite(val)) return false;
          const num = typeof val === 'bigint' ? val : BigInt(typeof val === 'number' ? Math.floor(val) : String(val));
          return num >= BigInt({f.minimum});
        }} catch {{
          return false;
        }}
      }},
      {{ message: "Field '{f.name}' must be a non-negative integer" }}
    )""")
        res = "".join(parts)
        return res if f.required else f"{res}.nullish()"

    if f.kind == "float":
        parts = [f"z.number({{ message: \"Field '{f.name}' must be a number\" }})"]
        if f.minimum is not None and f.maximum is not None:
            parts.append(f".min({f.minimum}, {{ message: \"Field '{f.name}' must be between {f.minimum} and {f.maximum}\" }})")
            parts.append(f".max({f.maximum}, {{ message: \"Field '{f.name}' must be between {f.minimum} and {f.maximum}\" }})")
        elif f.minimum is not None:
            parts.append(f".min({f.minimum}, {{ message: \"Field '{f.name}' must be non-negative\" }})")
        elif f.maximum is not None:
            parts.append(f".max({f.maximum})")
        res = "".join(parts)
        return res if f.required else f"{res}.nullish()"

    if f.kind == "bool":
        return "z.boolean()" if f.required else "z.boolean().nullish()"

    if f.kind == "enum":
        base = f"{f.ref}Schema"
        return base if f.required else f"{base}.nullish()"

    if f.kind == "fixed_array":
        base = f"{f.ref}Schema"
        return base if f.required else f"{base}.nullish()"

    if f.kind == "model":
        base = f"raw{f.ref}Schema"
        return base if f.required else f"{base}.nullish()"

    if f.kind == "generic_map":
        base = f"z.record(z.string(), z.unknown(), {{ message: \"Missing or invalid '{f.name}' object\" }})"
        return base if f.required else f"{base}.nullish()"

    raise ValueError(f"Unknown field kind: {f.kind}")


def emit_typescript(ir: DomainIR) -> str:
    lines = [
        "// Auto-generated by scripts/generate_domain.py. DO NOT EDIT DIRECTLY.",
        "/**",
        " * Domain schemas and DataFabric topic contracts for Web Visualizer & TeleopClient.",
        " */",
        "import { z } from 'zod';",
        "",
        "export const jsonInput = z.unknown().transform((val, ctx) => {",
        "  if (typeof val === 'string') {",
        "    try {",
        "      return JSON.parse(val);",
        "    } catch {",
        "      ctx.addIssue({ code: 'custom', message: 'Payload must be valid JSON' });",
        "      return z.NEVER;",
        "    }",
        "  }",
        "  return val;",
        "});",
    ]

    has_int = any(f.kind == "int" for m in ir.models for f in m.fields)
    if has_int:
        lines.append("")
        lines.append("export const timestampNsSchema = z")
        lines.append("  .union([z.bigint(), z.number(), z.string()], {")
        lines.append("    message: \"Missing required field 'timestamp_ns'\",")
        lines.append("  })")
        lines.append("  .refine(")
        lines.append("    (val) => {")
        lines.append("      try {")
        lines.append("        if (typeof val === 'number' && !Number.isFinite(val)) {")
        lines.append("          return false;")
        lines.append("        }")
        lines.append("        const ts =")
        lines.append("          typeof val === 'bigint'")
        lines.append("            ? val")
        lines.append("            : BigInt(typeof val === 'number' ? Math.floor(val) : String(val));")
        lines.append("        return ts >= 0n;")
        lines.append("      } catch {")
        lines.append("        return false;")
        lines.append("      }")
        lines.append("    },")
        lines.append('    { message: "Field \'timestamp_ns\' must be a non-negative integer" }')
        lines.append("  );")

    for e in ir.enums:
        desc_label = to_snake_case(e.name).replace("_", " ")
        lines.append("")
        if e.description:
            lines.append(f"/** {e.description} */")
        lines.append(f"export const {e.name} = {{")
        for v in e.variants:
            lines.append(f"  {v}: '{v}',")
        lines.append("} as const;")
        lines.append("")
        lines.append(f"export const {e.name}Schema = z.enum([")
        for v in e.variants:
            lines.append(f"  '{v}',")
        lines.append(f"], {{ message: 'Invalid {desc_label}' }});")
        lines.append("")
        lines.append(f"export const {to_camel_case(e.name)}Schema = {e.name}Schema;")
        lines.append("")
        lines.append(f"export type {e.name} = z.infer<typeof {e.name}Schema>;")

    for c in ir.constants:
        lines.append("")
        if c.description:
            lines.append(f"/** {c.description} */")
        lines.append(f"export const {c.name} = [")
        for item in c.items:
            lines.append(f"  '{item}',")
        lines.append("] as const;")
        lines.append("")
        lines.append(f"export const {c.alias} = {c.name};")
        lines.append("")
        lines.append(f"export const {c.item_type}Schema = z.enum({c.name});")
        lines.append(f"export const {to_camel_case(c.item_type)}Schema = {c.item_type}Schema;")
        lines.append("")
        lines.append(f"export type {c.item_type} = z.infer<typeof {c.item_type}Schema>;")

    for sc in ir.scalar_constants:
        lines.append("")
        if sc.description:
            lines.append(f"/** {sc.description} */")
        lines.append(f"export const {sc.name} = '{sc.value}';")

    for fa in ir.fixed_arrays:
        types_str = ", ".join(["number"] * fa.count)
        lines.append("")
        if fa.description:
            lines.append(f"/** {fa.description} */")
        lines.append(f"export type {fa.name} = [{types_str}];")
        lines.append("")
        lines.append(f"export const {fa.name}Schema = z")
        lines.append("  .array(")
        lines.append("    z.unknown().refine(")
        lines.append("      (val): val is number => typeof val === 'number' && Number.isFinite(val),")
        lines.append("      { message: 'Joint position is not a valid finite number' }")
        lines.append("    )")
        lines.append("  )")
        lines.append(f"  .refine((arr): arr is {fa.name} => arr.length === {fa.count}, {{")
        lines.append(f"    message: '{fa.name} must contain exactly {fa.count} joint positions',")
        lines.append("  });")
        lines.append("")
        lines.append(f"export const {to_camel_case(fa.name)}Schema = {fa.name}Schema;")
        if fa.name == "ArmJointPositions":
            lines.append(f"export const jointPositionsSchema = {fa.name}Schema;")

    for m in ir.models:
        lines.append("")
        if m.description:
            lines.append(f"/** {m.description} */")

        lines.append(f"export const raw{m.name}Schema = z.object(")
        lines.append("  {")
        for f in m.fields:
            field_schema = _ts_field_to_zod(f)
            lines.append(f"    {f.name}: {field_schema},")
        strict_str = ".strict()" if not m.additional_properties else ""
        lines.append("  },")
        lines.append(f"  {{ message: '{m.name} payload must be an object' }}")
        lines.append(f"){strict_str};")
        lines.append("")
        if m.is_submodel:
            lines.append(f"export const {m.name}Schema = raw{m.name}Schema;")
        else:
            lines.append(f"export const {m.name}Schema = jsonInput.pipe(raw{m.name}Schema);")
        lines.append(f"export const {to_camel_case(m.name)}Schema = {m.name}Schema;")
        lines.append("")
        lines.append(f"export type {m.name} = z.infer<typeof raw{m.name}Schema>;")

    lines.append("")
    lines.append("function unwrapZod<T>(result: {")
    lines.append("  success: true;")
    lines.append("  data: unknown;")
    lines.append("} | {")
    lines.append("  success: false;")
    lines.append("  error: { issues: Array<{ message: string }> };")
    lines.append("}): T {")
    lines.append("  if (!result.success) {")
    lines.append("    throw new Error(result.error.issues[0]?.message ?? 'Validation failed');")
    lines.append("  }")
    lines.append("  return result.data as T;")
    lines.append("}")

    for m in ir.models:
        lines.append("")
        lines.append(f"export function parse{m.name}(input: unknown): {m.name} {{")
        lines.append(f"  return unwrapZod<{m.name}>({to_camel_case(m.name)}Schema.safeParse(input));")
        lines.append("}")
        lines.append("")
        lines.append(f"export function is{m.name}(input: unknown): input is {m.name} {{")
        lines.append(f"  return {to_camel_case(m.name)}Schema.safeParse(input).success;")
        lines.append("}")

    if ir.channels:
        channels_regex = "|".join(ir.channels)
        channels_union = " | ".join(f"'{c}'" for c in ir.channels)
        lines.append("")
        lines.append("export const robotIdSchema = z")
        lines.append("  .string({")
        lines.append('    message: "Invalid robot ID: must be non-empty and not contain slashes or whitespace",')
        lines.append("  })")
        lines.append("  .min(1, {")
        lines.append('    message: "Invalid robot ID: must be non-empty and not contain slashes or whitespace",')
        lines.append("  })")
        lines.append("  .regex(/^[^/\\\\\\s]+$/, {")
        lines.append('    message: "Invalid robot ID: must be non-empty and not contain slashes or whitespace",')
        lines.append("  });")
        lines.append("")
        lines.append("export const robotTopicSchema = z")
        lines.append("  .string()")
        lines.append(f"  .regex(/^robot\\/([^/\\\\\\s]+)\\/({channels_regex})$/)")
        lines.append("  .transform((topic) => {")
        lines.append("    const parts = topic.split('/');")
        lines.append("    return {")
        lines.append("      robotId: parts[1],")
        lines.append(f"      channel: parts[2] as {channels_union},")
        lines.append("    };")
        lines.append("  });")

        for ch in ir.channels:
            fn_name = f"robot{to_pascal_case(ch)}Topic"
            lines.append("")
            lines.append(f"export function {fn_name}(robotId: string): string {{")
            lines.append("  const validId = robotIdSchema.parse(robotId);")
            lines.append(f"  return `robot/${{validId}}/{ch}`;")
            lines.append("}")

        lines.append("")
        lines.append("export function parseRobotTopic(")
        lines.append("  topic: string")
        lines.append(f"): {{ robotId: string; channel: {channels_union} }} | null {{")
        lines.append("  const result = robotTopicSchema.safeParse(topic);")
        lines.append("  return result.success ? result.data : null;")
        lines.append("}")

    has_command = any(m.name == "RobotCommand" for m in ir.models)
    if has_command:
        lines.append("")
        lines.append("export function serializeCommand(cmd: RobotCommand): string {")
        lines.append("  return JSON.stringify(cmd, (_, v) =>")
        lines.append("    typeof v === 'bigint' ? Number(v) : v")
        lines.append("  );")
        lines.append("}")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate domain models from JSON schemas")
    parser.add_argument("--check", action="store_true", help="Verify generated files match without writing")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    schemas_dir = repo_root / "schemas"

    rust_target = repo_root / "src" / "domain" / "domain.rs"
    py_target = repo_root / "src" / "domain" / "domain.py"
    ts_target = repo_root / "web" / "domain" / "contracts.ts"

    ir = parse_schemas(schemas_dir)

    rust_content = emit_rust(ir)
    py_content = emit_python(ir)
    ts_content = emit_typescript(ir)

    targets = [
        (rust_target, rust_content),
        (py_target, py_content),
        (ts_target, ts_content),
    ]

    if args.check:
        mismatched = []
        for path, expected in targets:
            if not path.exists():
                mismatched.append(f"Missing: {path}")
            else:
                actual = path.read_text(encoding="utf-8")
                if actual != expected:
                    mismatched.append(f"Drift detected in: {path}")
        if mismatched:
            for m in mismatched:
                print(m, file=sys.stderr)
            return 1
        print("All domain targets match schemas. OK.")
        return 0

    for path, content in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"Generated {path.relative_to(repo_root)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
