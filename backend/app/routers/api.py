from datetime import timedelta

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Request

from backend.app.config import get_settings
from backend.app.services.cache import InvalidCatalogError, get_filtered_data
from backend.app.services.catalog_service import discover_catalogs

_VALID_PROPERTIES = {
    "lensName",
    "cameraName",
    "focalLength",
    "aperture",
    "shutterSpeed",
}
_VALID_GROUPINGS = {"day", "week", "month", "quarter", "year"}
_GROUPING_TO_FREQ = {"day": "D", "week": "W", "month": "M", "quarter": "Q", "year": "Y"}

router = APIRouter()


def _get_filtered_data_or_404(
    cache,
    catalog: str | None,
    catalog_dir: str,
    start_date: str | None = None,
    end_date: str | None = None,
    picks_only: bool = False,
    min_rating: int = 0,
    exclude_cameras: str = "",
    exclude_lenses: str = "",
) -> pd.DataFrame:
    try:
        return get_filtered_data(
            cache=cache,
            catalog=catalog,
            catalog_dir=catalog_dir,
            start_date=start_date,
            end_date=end_date,
            picks_only=picks_only,
            min_rating=min_rating,
            exclude_cameras=exclude_cameras,
            exclude_lenses=exclude_lenses,
        )
    except InvalidCatalogError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _client_key_from_request(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/catalogs")
def list_catalogs():
    settings = get_settings()
    return discover_catalogs(settings.catalog_dir)


@router.post("/refresh")
def refresh_cache(request: Request):
    settings = get_settings()
    cache = request.app.state.cache

    client_key = _client_key_from_request(request)
    if cache.is_refresh_rate_limited(client_key, settings.refresh_rate_limit_per_minute):
        raise HTTPException(
            status_code=429,
            detail=(
                "Refresh rate limit exceeded. "
                f"Max {settings.refresh_rate_limit_per_minute} request(s) per minute."
            ),
        )

    remaining_cooldown = cache.start_manual_refresh(settings.refresh_cooldown_seconds)
    if remaining_cooldown > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Refresh cooldown active. Try again in {remaining_cooldown} second(s).",
        )

    cache.refresh(settings.catalog_dir)
    return {"status": "ok"}


@router.get("/overview")
def overview(
    request: Request,
    catalog: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    picks_only: bool = Query(False),
    min_rating: int = Query(0),
    exclude_cameras: str = Query(""),
):
    settings = get_settings()
    cache = request.app.state.cache
    df = _get_filtered_data_or_404(
        cache=cache,
        catalog=catalog,
        catalog_dir=settings.catalog_dir,
        start_date=start_date,
        end_date=end_date,
        picks_only=picks_only,
        min_rating=min_rating,
        exclude_cameras=exclude_cameras,
    )

    if df.empty:
        return {
            "total_photos": 0,
            "date_range": {"earliest": None, "latest": None},
            "most_used_camera": None,
            "most_used_lens": None,
            "most_used_focal_length": None,
            "photos_per_month": [],
            "rating_distribution": [{"rating": r, "count": 0} for r in range(6)],
            "cameras": [],
            "lenses": [],
        }

    # total_photos
    total_photos = len(df)

    # date_range
    earliest = df["captureTime"].min()
    latest = df["captureTime"].max()
    date_range = {
        "earliest": earliest.strftime("%Y-%m-%d") if not_nat(earliest) else None,
        "latest": latest.strftime("%Y-%m-%d") if not_nat(latest) else None,
    }

    # most_used_camera
    camera_counts = df["cameraName"].value_counts()
    if not camera_counts.empty:
        most_used_camera = {
            "name": camera_counts.index[0],
            "count": int(camera_counts.iloc[0]),
        }
    else:
        most_used_camera = None

    # most_used_lens (handle NaN)
    lens_counts = df["lensName"].dropna().value_counts()
    if not lens_counts.empty:
        most_used_lens = {
            "name": lens_counts.index[0],
            "count": int(lens_counts.iloc[0]),
        }
    else:
        most_used_lens = None

    # most_used_focal_length
    fl_counts = df["focalLength"].dropna().value_counts()
    if not fl_counts.empty:
        fl_value = fl_counts.index[0]
        most_used_focal_length = {
            "name": _format_focal_length(fl_value),
            "count": int(fl_counts.iloc[0]),
        }
    else:
        most_used_focal_length = None

    # photos_per_month
    if "captureTime" in df.columns and df["captureTime"].notna().any():
        monthly = df.dropna(subset=["captureTime"]).copy()
        monthly["period"] = monthly["captureTime"].dt.to_period("M")
        month_counts = monthly.groupby("period").size().sort_index()
        photos_per_month = [
            {"period": str(period), "count": int(count)} for period, count in month_counts.items()
        ]
    else:
        photos_per_month = []

    # rating_distribution (always include 0-5)
    rating_counts = df["rating"].value_counts()
    rating_distribution = []
    for r in range(6):
        count = int(rating_counts.get(float(r), 0))
        rating_distribution.append({"rating": r, "count": count})

    # cameras (sorted unique)
    cameras = sorted(df["cameraName"].dropna().unique().tolist())

    # lenses (sorted unique, excluding NaN)
    lenses = sorted(df["lensName"].dropna().unique().tolist())

    return {
        "total_photos": total_photos,
        "date_range": date_range,
        "most_used_camera": most_used_camera,
        "most_used_lens": most_used_lens,
        "most_used_focal_length": most_used_focal_length,
        "photos_per_month": photos_per_month,
        "rating_distribution": rating_distribution,
        "cameras": cameras,
        "lenses": lenses,
    }


@router.get("/breakdown")
def breakdown(
    request: Request,
    catalog: str | None = Query(None),
    property: str = Query("lensName"),
    grouping: str = Query("month"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    picks_only: bool = Query(False),
    min_rating: int = Query(0),
    exclude_cameras: str = Query(""),
    exclude_lenses: str = Query(""),
    top_n: int = Query(50, ge=1, le=100),
):
    if property not in _VALID_PROPERTIES:
        valid = ", ".join(sorted(_VALID_PROPERTIES))
        raise HTTPException(
            status_code=422,
            detail=f"Invalid property: {property}. Must be one of: {valid}",
        )
    if grouping not in _VALID_GROUPINGS:
        valid = ", ".join(sorted(_VALID_GROUPINGS))
        raise HTTPException(
            status_code=422,
            detail=f"Invalid grouping: {grouping}. Must be one of: {valid}",
        )

    settings = get_settings()
    cache = request.app.state.cache
    df = _get_filtered_data_or_404(
        cache=cache,
        catalog=catalog,
        catalog_dir=settings.catalog_dir,
        start_date=start_date,
        end_date=end_date,
        picks_only=picks_only,
        min_rating=min_rating,
        exclude_cameras=exclude_cameras,
        exclude_lenses=exclude_lenses,
    )

    empty_response = {
        "property": property,
        "grouping": grouping,
        "data": [],
        "totals": [],
    }

    if df.empty:
        return empty_response

    # Drop rows without a valid capture time (can't assign to a period)
    df = df.dropna(subset=["captureTime"])
    if df.empty:
        return empty_response

    # Fill NaN property values with "Unknown"
    df[property] = df[property].fillna("Unknown")

    # Determine top N values by total count
    value_counts = df[property].value_counts()
    top_values = set(value_counts.head(top_n).index)

    # Replace non-top values with "Other"
    needs_other = len(value_counts) > top_n
    if needs_other:
        df[property] = df[property].apply(lambda v: v if v in top_values else "Other")

    # Assign period column
    freq = _GROUPING_TO_FREQ[grouping]
    df["period"] = df["captureTime"].dt.to_period(freq)

    # Group by period + property, count
    grouped = df.groupby(["period", property]).size().reset_index(name="count")

    # Format period strings
    data = []
    for _, row in grouped.iterrows():
        data.append(
            {
                "period": _format_period(row["period"], grouping),
                "value": row[property],
                "count": int(row["count"]),
            }
        )

    # Sort data by period then value (str() handles mixed str/float from focalLength)
    data.sort(key=lambda r: (r["period"], str(r["value"])))

    # Compute totals: group by property only, count, sorted descending
    totals_grouped = df.groupby(property).size().reset_index(name="count")
    totals_grouped = totals_grouped.sort_values("count", ascending=False)
    totals = [
        {"value": row[property], "count": int(row["count"])} for _, row in totals_grouped.iterrows()
    ]

    return {
        "property": property,
        "grouping": grouping,
        "data": data,
        "totals": totals,
    }


@router.get("/drilldown")
def drilldown(
    request: Request,
    catalog: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    picks_only: bool = Query(False),
    min_rating: int = Query(0),
    exclude_cameras: str = Query(""),
    exclude_lenses: str = Query(""),
    hierarchy: str = Query("cameraName,lensName,focalLength"),
    filter_values: str = Query(""),
):
    # Parse hierarchy into list of property names
    hierarchy_list = [h.strip() for h in hierarchy.split(",") if h.strip()]
    if not hierarchy_list:
        raise HTTPException(status_code=422, detail="Hierarchy must not be empty")

    # Validate all properties in hierarchy
    for prop in hierarchy_list:
        if prop not in _VALID_PROPERTIES:
            valid = ", ".join(sorted(_VALID_PROPERTIES))
            raise HTTPException(
                status_code=422,
                detail=f"Invalid property in hierarchy: {prop}. Must be one of: {valid}",
            )

    # Parse filter_values into list (empty string -> empty list)
    filter_values_list = (
        [v.strip() for v in filter_values.split(",") if v.strip()] if filter_values else []
    )

    # Validate: filter_values can't exceed hierarchy depth - 1
    level = len(filter_values_list)
    if level >= len(hierarchy_list):
        max_len = len(hierarchy_list) - 1
        raise HTTPException(
            status_code=422,
            detail=f"filter_values has {level} values but hierarchy "
            f"only has {len(hierarchy_list)} levels. "
            f"Maximum filter_values length is {max_len}.",
        )

    settings = get_settings()
    cache = request.app.state.cache
    df = _get_filtered_data_or_404(
        cache=cache,
        catalog=catalog,
        catalog_dir=settings.catalog_dir,
        start_date=start_date,
        end_date=end_date,
        picks_only=picks_only,
        min_rating=min_rating,
        exclude_cameras=exclude_cameras,
        exclude_lenses=exclude_lenses,
    )

    current_property = hierarchy_list[level]

    if df.empty:
        result = {
            "level": level,
            "property": current_property,
            "data": [],
        }
        if filter_values_list:
            result["parent_filters"] = {
                hierarchy_list[i]: filter_values_list[i] for i in range(level)
            }
        return result

    # Fill NaN values with "Unknown" for all hierarchy properties
    for prop in hierarchy_list:
        df[prop] = df[prop].fillna("Unknown")

    # Apply drilldown filters for each level
    for i in range(level):
        prop = hierarchy_list[i]
        value = filter_values_list[i]
        df = df[df[prop] == value]

    # Group by current property, count, sort descending
    counts = df[current_property].value_counts().sort_values(ascending=False)
    data = [{"value": value, "count": int(count)} for value, count in counts.items()]

    result = {
        "level": level,
        "property": current_property,
        "data": data,
    }

    if filter_values_list:
        result["parent_filters"] = {hierarchy_list[i]: filter_values_list[i] for i in range(level)}

    return result


@router.get("/comparison")
def comparison(
    request: Request,
    catalog: str | None = Query(None),
    property: str = Query("lensName"),
    grouping: str = Query("month"),
    period_a_start: str = Query(...),
    period_a_end: str = Query(...),
    period_b_start: str = Query(...),
    period_b_end: str = Query(...),
    picks_only: bool = Query(False),
    min_rating: int = Query(0),
    exclude_cameras: str = Query(""),
    exclude_lenses: str = Query(""),
):
    if property not in _VALID_PROPERTIES:
        valid = ", ".join(sorted(_VALID_PROPERTIES))
        raise HTTPException(
            status_code=422,
            detail=f"Invalid property: {property}. Must be one of: {valid}",
        )
    if grouping not in _VALID_GROUPINGS:
        valid = ", ".join(sorted(_VALID_GROUPINGS))
        raise HTTPException(
            status_code=422,
            detail=f"Invalid grouping: {grouping}. Must be one of: {valid}",
        )

    settings = get_settings()
    cache = request.app.state.cache

    # Get data without date filtering — we'll filter each period independently
    df = _get_filtered_data_or_404(
        cache=cache,
        catalog=catalog,
        catalog_dir=settings.catalog_dir,
        picks_only=picks_only,
        min_rating=min_rating,
        exclude_cameras=exclude_cameras,
        exclude_lenses=exclude_lenses,
    )

    def _build_period_data(
        base_df: pd.DataFrame, start: str, end: str, prop: str, grp: str
    ) -> dict:
        label = _generate_period_label(start, end)

        if base_df.empty:
            return {"label": label, "data": [], "total": 0}

        start_dt = pd.to_datetime(start)
        end_dt = pd.to_datetime(end)
        period_df = base_df[
            (base_df["captureTime"] >= start_dt) & (base_df["captureTime"] <= end_dt)
        ].copy()

        total = len(period_df)
        if period_df.empty:
            return {"label": label, "data": [], "total": 0}

        # Drop rows without capture time, fill NaN property values
        period_df = period_df.dropna(subset=["captureTime"])
        period_df[prop] = period_df[prop].fillna("Unknown")

        freq = _GROUPING_TO_FREQ[grp]
        period_df["period"] = period_df["captureTime"].dt.to_period(freq)

        grouped = period_df.groupby(["period", prop]).size().reset_index(name="count")

        data = []
        for _, row in grouped.iterrows():
            data.append(
                {
                    "period": _format_period(row["period"], grp),
                    "value": row[prop],
                    "count": int(row["count"]),
                }
            )

        data.sort(key=lambda r: (r["period"], str(r["value"])))

        return {"label": label, "data": data, "total": total}

    period_a = _build_period_data(df, period_a_start, period_a_end, property, grouping)
    period_b = _build_period_data(df, period_b_start, period_b_end, property, grouping)

    return {
        "property": property,
        "period_a": period_a,
        "period_b": period_b,
    }


@router.get("/heatmap")
def heatmap(
    request: Request,
    catalog: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    picks_only: bool = Query(False),
    min_rating: int = Query(0),
    exclude_cameras: str = Query(""),
):
    settings = get_settings()
    cache = request.app.state.cache
    df = _get_filtered_data_or_404(
        cache=cache,
        catalog=catalog,
        catalog_dir=settings.catalog_dir,
        start_date=start_date,
        end_date=end_date,
        picks_only=picks_only,
        min_rating=min_rating,
        exclude_cameras=exclude_cameras,
    )

    if df.empty:
        return {"data": []}

    # Drop rows without a valid capture time
    df = df.dropna(subset=["captureTime"])
    if df.empty:
        return {"data": []}

    # Determine date range boundaries
    latest_photo = df["captureTime"].max()
    if start_date is not None:
        range_start = pd.to_datetime(start_date).date()
    else:
        # Default: 1 year before the latest photo
        range_start = (latest_photo - timedelta(days=365)).date()

    if end_date is not None:
        range_end = pd.to_datetime(end_date).date()
    else:
        range_end = latest_photo.date()

    # Group by date, count photos per day
    daily_counts = df.groupby(df["captureTime"].dt.date).size()

    # Generate complete date range with zero-fill
    all_dates = pd.date_range(start=range_start, end=range_end, freq="D")
    data = []
    for d in all_dates:
        date_key = d.date()
        count = int(daily_counts.get(date_key, 0))
        data.append({"date": date_key.isoformat(), "count": count})

    return {"data": data}


@router.get("/rating-distribution")
def rating_distribution(
    request: Request,
    catalog: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    picks_only: bool = Query(False),
    exclude_cameras: str = Query(""),
):
    settings = get_settings()
    cache = request.app.state.cache
    df = _get_filtered_data_or_404(
        cache=cache,
        catalog=catalog,
        catalog_dir=settings.catalog_dir,
        start_date=start_date,
        end_date=end_date,
        picks_only=picks_only,
        min_rating=0,
        exclude_cameras=exclude_cameras,
    )

    empty_overall = [{"rating": r, "count": 0, "percentage": 0.0} for r in range(6)]
    empty_pick_stats = {
        "total": 0,
        "picked": 0,
        "pick_rate": 0.0,
        "by_camera": [],
    }

    if df.empty:
        return {
            "overall": empty_overall,
            "by_camera": [],
            "over_time": [],
            "pick_stats": empty_pick_stats,
        }

    # Treat NULL ratings as 0
    df["rating"] = df["rating"].fillna(0.0)

    total = len(df)

    # overall: distribution of ratings 0-5
    rating_counts = df["rating"].value_counts()
    overall = []
    for r in range(6):
        count = int(rating_counts.get(float(r), 0))
        percentage = round(count / total * 100, 1) if total > 0 else 0.0
        overall.append({"rating": r, "count": count, "percentage": percentage})

    # by_camera: avg rating and count of rated photos (rating > 0) per camera
    rated = df[df["rating"] > 0]
    by_camera: list[dict[str, object]] = []
    if not rated.empty:
        camera_groups = rated.groupby("cameraName")["rating"]
        for camera, group in camera_groups:
            by_camera.append(
                {
                    "camera": camera,
                    "avg_rating": round(float(group.mean()), 1),
                    "rated_count": int(len(group)),
                }
            )
        # Sort by avg_rating descending (highest to lowest)
        by_camera.sort(key=lambda x: x["avg_rating"], reverse=True)  # type: ignore[arg-type, return-value]

    # over_time: avg rating and rated count by month for rated photos
    if rated.empty or rated["captureTime"].isna().all():
        over_time: list[dict[str, object]] = []
    else:
        rated_with_time = rated.dropna(subset=["captureTime"]).copy()
        if rated_with_time.empty:
            over_time = []
        else:
            rated_with_time["period"] = rated_with_time["captureTime"].dt.to_period("M")
            monthly = rated_with_time.groupby("period")["rating"]
            over_time = []
            for period, group in sorted(monthly, key=lambda x: str(x[0])):
                over_time.append(
                    {
                        "period": str(period),
                        "avg_rating": round(float(group.mean()), 1),
                        "rated_count": int(len(group)),
                    }
                )

    # pick_stats: pick rate overall and by camera
    pick_total = len(df)
    if "pick" in df.columns:
        picked_count = int((df["pick"] == 1.0).sum())
    else:
        picked_count = 0
    pick_rate = round(picked_count / pick_total * 100, 1) if pick_total > 0 else 0.0

    pick_by_camera: list[dict[str, object]] = []
    if "pick" in df.columns and "cameraName" in df.columns:
        cam_groups = df.groupby("cameraName")["pick"]
        for camera, picks in cam_groups:
            cam_total = int(len(picks))
            cam_picked = int((picks == 1.0).sum())
            cam_rate = round(cam_picked / cam_total * 100, 1) if cam_total > 0 else 0.0
            pick_by_camera.append(
                {
                    "camera": camera,
                    "total": cam_total,
                    "picked": cam_picked,
                    "pick_rate": cam_rate,
                }
            )
        pick_by_camera.sort(key=lambda x: x["pick_rate"], reverse=True)  # type: ignore[arg-type, return-value]

    pick_stats = {
        "total": pick_total,
        "picked": picked_count,
        "pick_rate": pick_rate,
        "by_camera": pick_by_camera,
    }

    return {
        "overall": overall,
        "by_camera": by_camera,
        "over_time": over_time,
        "pick_stats": pick_stats,
    }


def _generate_period_label(start: str, end: str) -> str:
    """Generate a human-readable label for a date range."""
    start_dt = pd.to_datetime(start)
    end_dt = pd.to_datetime(end)

    _MONTH_ABBR = [
        "",
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ]

    if start_dt.year == end_dt.year:
        # Same year
        is_full_year = (
            start_dt.month == 1 and start_dt.day == 1 and end_dt.month == 12 and end_dt.day == 31
        )
        if is_full_year:
            return str(start_dt.year)
        # Partial year
        start_month = _MONTH_ABBR[start_dt.month]
        end_month = _MONTH_ABBR[end_dt.month]
        return f"{start_month}\u2013{end_month} {start_dt.year}"
    else:
        # Multiple years
        return f"{start_dt.year}\u2013{end_dt.year}"


def _format_period(period: pd.Period, grouping: str) -> str:
    """Format a pandas Period to the appropriate string for the grouping."""
    if grouping == "day":
        return period.strftime("%Y-%m-%d")
    elif grouping == "week":
        # ISO week format: YYYY-WNN
        start = period.start_time
        return f"{start.isocalendar()[0]}-W{start.isocalendar()[1]:02d}"
    elif grouping == "month":
        return period.strftime("%Y-%m")
    elif grouping == "quarter":
        return f"{period.start_time.year}-Q{period.quarter}"
    elif grouping == "year":
        return str(period.start_time.year)
    return str(period)


def not_nat(value: pd.Timestamp | None) -> bool:
    """Check if a pandas Timestamp is not NaT."""
    return bool(pd.notna(value))


def _format_focal_length(value: float) -> str:
    """Format a focal length value with mm suffix."""
    if value == int(value):
        return f"{int(value)}mm"
    return f"{value}mm"
