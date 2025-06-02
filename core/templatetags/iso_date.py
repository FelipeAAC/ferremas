from django import template
from datetime import datetime

register = template.Library()

@register.filter
def iso_to_dmy_hm(value):
    if not value:
        return ""
    try:
        dt = datetime.fromisoformat(value)
        return dt.strftime("%d/%m/%y %H:%M")
    except Exception:
        try:
            dt = datetime.strptime(value, "%Y-%m-%d")
            return dt.strftime("%d/%m/%y")
        except Exception:
            return value