//! Closed, bounded semantic values for the feasibility probe, before adoption.
//!
//! Frame-size and view-size checks do not prove adversarial decode work bounds.
//! A public relay still requires the planned import worker/resource gate.

use crate::{Error, actions::validate_id};
use serde_json::{Map, Value};

fn object(value: &Value) -> Result<&Map<String, Value>, Error> {
    value.as_object().ok_or(Error::Contract("metadata object"))
}

fn cell_key(mut key: &str) -> Result<(), Error> {
    for _ in 0..3 {
        let (encoded_length, rest) = key.split_once(':').ok_or(Error::Contract("cell identity"))?;
        let length =
            encoded_length.parse::<usize>().map_err(|_| Error::Contract("cell identity length"))?;
        if length.to_string() != encoded_length {
            return Err(Error::Contract("canonical cell identity length"));
        }
        if length == 0 || length > 128 || rest.len() < length || !rest.is_char_boundary(length) {
            return Err(Error::Contract("cell identity component"));
        }
        validate_id(&rest[..length])?;
        key = &rest[length..];
    }
    if !key.is_empty() {
        return Err(Error::Contract("cell identity trailing bytes"));
    }
    Ok(())
}

fn runs(value: &Value, body: &Value) -> Result<(), Error> {
    let values = value.as_array().ok_or(Error::Contract("formatted runs"))?;
    let mut text = String::new();
    let mut prior = None;
    for run in values {
        let run = object(run)?;
        let value = run.get("text").and_then(Value::as_str).ok_or(Error::Contract("run text"))?;
        let strong =
            run.get("strong").and_then(Value::as_bool).ok_or(Error::Contract("run strong"))?;
        if run.len() != 2 || value.is_empty() || prior == Some(strong) {
            return Err(Error::Contract("canonical formatted runs"));
        }
        text.push_str(value);
        prior = Some(strong);
    }
    if body.as_str() != Some(&text) {
        return Err(Error::Contract("formatted text parity"));
    }
    Ok(())
}

pub(crate) fn validate_register_value(root: &str, field: &str, value: &Value) -> Result<(), Error> {
    match (root, field) {
        ("columns", "width")
            if value.as_u64().is_some_and(|width| (32..=4096).contains(&width)) =>
        {
            Ok(())
        }
        ("images", "alt") if value.as_str().is_some_and(|text| text.len() <= 4096) => Ok(()),
        ("images", "asset") => {
            validate_id(value.as_str().ok_or(Error::Contract("asset identity"))?)
        }
        _ => Err(Error::Contract("register semantic value")),
    }
}

pub(crate) fn validate_view(view: &Value) -> Result<(), Error> {
    let root = object(view)?;
    for (name, value) in root {
        match name.as_str() {
            "body" => {
                value.as_str().ok_or(Error::Contract("body text"))?;
            }
            "body_runs" => runs(value, root.get("body").ok_or(Error::Contract("body text"))?)?,
            "cells" => {
                let cells = object(value)?;
                if cells.len() > 4096 {
                    return Err(Error::Limit("probe cell count"));
                }
                for (key, value) in cells {
                    cell_key(key)?;
                    for (field, value) in object(value)? {
                        match field.as_str() {
                            "body" if value.as_str().is_some() => {}
                            "body_runs" => runs(
                                value,
                                object(cells.get(key).ok_or(Error::Contract("cell"))?)?
                                    .get("body")
                                    .ok_or(Error::Contract("cell body"))?,
                            )?,
                            _ => return Err(Error::Contract("cell text field")),
                        }
                    }
                }
            }
            "columns" => {
                let columns = object(value)?;
                if columns.len() > 128 {
                    return Err(Error::Limit("probe column count"));
                }
                for (key, value) in columns {
                    validate_id(key)?;
                    for (field, value) in object(value)? {
                        if field != "width"
                            || !value.as_u64().is_some_and(|width| (32..=4096).contains(&width))
                        {
                            return Err(Error::Contract("column width field"));
                        }
                    }
                }
            }
            "images" => {
                let images = object(value)?;
                if images.len() > 4096 {
                    return Err(Error::Limit("probe image count"));
                }
                for (key, value) in images {
                    validate_id(key)?;
                    for (field, value) in object(value)? {
                        let text = value.as_str().ok_or(Error::Contract("image text field"))?;
                        match field.as_str() {
                            "alt" if text.len() <= 4096 => {}
                            "asset" => validate_id(text)?,
                            _ => return Err(Error::Contract("image metadata field")),
                        }
                    }
                }
            }
            _ => return Err(Error::Contract("probe root name")),
        }
    }
    Ok(())
}
